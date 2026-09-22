import type { DomainEvent } from '@mkt/shared-kernel';
import { type Clock, ConflictError, createDomainEvent, NotFoundError } from '@mkt/shared-kernel';

import { assertValidTenantSlug } from '../domain/tenant-slug.js';
import type { ProvisionTenantInput, TenantRegistryPort, TenantSummary } from './tenant-registry.js';

/** Etapas do provisionamento, na ordem (`06-multi-tenancy.md` §9). */
export const PROVISIONING_STEPS = [
  'registry',
  'clerk_organization',
  'admin_invite',
  'module_seeds',
  'activation',
] as const;

export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

export interface StepRecord {
  readonly step: string;
  readonly status: 'pending' | 'done' | 'failed';
  readonly detail?: string;
}

export interface ProvisioningStepsPort {
  list(tenantId: string): Promise<StepRecord[]>;
  markDone(tenantId: string, step: string, detail?: string): Promise<void>;
  markFailed(tenantId: string, step: string, detail: string): Promise<void>;
}

/** Cria a organização do tenant na Clerk e convida o admin (ADR-013). */
export interface WorkforceProvisioningPort {
  createTenantOrganization(input: { tenantId: string; name: string }): Promise<{ organizationId: string }>;
  inviteTenantAdmin(input: { organizationId: string; email: string }): Promise<void>;
  linkOrganization(input: { organizationId: string; tenantId: string }): Promise<void>;
}

export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

export interface TransactionPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const PROVISIONING_STEPS_REPOSITORY = Symbol('PROVISIONING_STEPS_REPOSITORY');
export const WORKFORCE_PROVISIONING = Symbol('WORKFORCE_PROVISIONING');
export const TENANCY_EVENT_PUBLISHER = Symbol('TENANCY_EVENT_PUBLISHER');
export const TENANCY_TRANSACTION = Symbol('TENANCY_TRANSACTION');

export interface ProvisionTenantCommand extends ProvisionTenantInput {
  /** E-mail do admin inicial, convidado como `org:tenant_admin`. */
  readonly adminEmail: string;
  /** Template de categorias/conteúdo; vai no evento para os módulos semearem. */
  readonly template?: string;
}

export interface ProvisionTenantResult {
  readonly tenant: TenantSummary;
  readonly steps: StepRecord[];
  /** Etapas executadas **nesta** chamada (vazio numa reexecução completa). */
  readonly executed: string[];
}

/**
 * Provisiona um tenant (US-076 / RF-TEN-01).
 *
 * Cada etapa é registrada em `provisioning_steps` antes de a seguinte começar,
 * e toda etapa checa se já está `done` — então reexecutar depois de uma falha
 * parcial refaz **só o que falta**, que é o 2º cenário do Gherkin. É por isso
 * que o processo é uma sequência explícita de etapas e não um bloco único: sem
 * o registro, um erro no meio deixaria o tenant num estado que ninguém sabe
 * como retomar.
 *
 * O seed dos outros módulos não acontece aqui: o evento `tenancy.tenant.created`
 * dispara cada um, e eles confirmam pela fachada (`confirmModuleSeed`). Quando
 * todos confirmam, a ativação acontece — ver `CompleteProvisioning`.
 */
export class ProvisionTenant {
  constructor(
    private readonly registry: TenantRegistryPort,
    private readonly steps: ProvisioningStepsPort,
    private readonly workforce: WorkforceProvisioningPort,
    private readonly events: EventPublisherPort,
    private readonly transaction: TransactionPort,
    private readonly clock: Clock,
    /** Módulos que precisam confirmar o seed antes da ativação. */
    private readonly seedModules: readonly string[] = [],
  ) {}

  async execute(command: ProvisionTenantCommand): Promise<ProvisionTenantResult> {
    assertValidTenantSlug(command.slug);

    const existing = await this.registry.findBySlug(command.slug);
    if (existing !== undefined && existing.status !== 'provisioning') {
      // tenant já provisionado: criar de novo seria duplicar um marketplace
      throw new ConflictError(`Já existe um tenant com o slug "${command.slug}"`, { slug: command.slug });
    }

    const executed: string[] = [];
    const tenant = existing ?? (await this.createRegistry(command, executed));
    const done = new Set(
      (await this.steps.list(tenant.id)).filter((s) => s.status === 'done').map((s) => s.step),
    );

    if (!done.has('clerk_organization')) {
      await this.createOrganization(tenant, command, executed);
    }
    if (!done.has('admin_invite')) {
      await this.inviteAdmin(tenant, command, executed);
    }

    return {
      tenant: (await this.registry.findBySlug(command.slug)) ?? tenant,
      steps: await this.steps.list(tenant.id),
      executed,
    };
  }

  /** Registro + domínio + evento, tudo na mesma transação (CLAUDE.md §4.5). */
  private async createRegistry(command: ProvisionTenantCommand, executed: string[]): Promise<TenantSummary> {
    return this.transaction.run(async () => {
      const tenant = await this.registry.provision({
        slug: command.slug,
        name: command.name,
        // nasce em provisioning; só vira trial quando os seeds terminam
        status: 'provisioning',
        ...(command.planId === undefined ? {} : { planId: command.planId }),
        ...(command.hostname === undefined ? {} : { hostname: command.hostname }),
      });

      await this.events.publish(
        createDomainEvent(
          {
            type: 'tenancy.tenant.created',
            source: 'mkt/tenancy',
            tenantId: tenant.id,
            subject: `tenant/${tenant.id}`,
            data: {
              tenantId: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
              ...(command.planId === undefined ? {} : { planId: command.planId }),
              ...(command.template === undefined ? {} : { template: command.template }),
            },
          },
          this.clock,
        ),
      );

      await this.steps.markDone(tenant.id, 'registry');
      // as etapas de seed nascem pendentes para ficar visível o que falta
      for (const module of this.seedModules) {
        await this.steps.markFailed(tenant.id, `seed:${module}`, 'aguardando o módulo confirmar');
      }

      executed.push('registry');
      return tenant;
    });
  }

  private async createOrganization(
    tenant: TenantSummary,
    command: ProvisionTenantCommand,
    executed: string[],
  ): Promise<void> {
    try {
      const { organizationId } = await this.workforce.createTenantOrganization({
        tenantId: tenant.id,
        name: command.name,
      });
      await this.workforce.linkOrganization({ organizationId, tenantId: tenant.id });
      await this.steps.markDone(tenant.id, 'clerk_organization', organizationId);
      executed.push('clerk_organization');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.steps.markFailed(tenant.id, 'clerk_organization', detail);
      throw error;
    }
  }

  private async inviteAdmin(
    tenant: TenantSummary,
    command: ProvisionTenantCommand,
    executed: string[],
  ): Promise<void> {
    const organizationStep = (await this.steps.list(tenant.id)).find(
      (step) => step.step === 'clerk_organization' && step.status === 'done',
    );

    if (organizationStep?.detail === undefined) {
      throw new NotFoundError('Organização do tenant', { tenantId: tenant.id });
    }

    try {
      await this.workforce.inviteTenantAdmin({
        organizationId: organizationStep.detail,
        email: command.adminEmail,
      });
      await this.steps.markDone(tenant.id, 'admin_invite');
      executed.push('admin_invite');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.steps.markFailed(tenant.id, 'admin_invite', detail);
      throw error;
    }
  }
}
