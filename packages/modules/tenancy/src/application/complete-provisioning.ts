import { type Clock, createDomainEvent, NotFoundError } from '@mkt/shared-kernel';

import type { EventPublisherPort, ProvisioningStepsPort, TransactionPort } from './provision-tenant.js';
import type { TenantRegistryPort } from './tenant-registry.js';

export interface SeedConfirmation {
  readonly module: string;
  readonly activated: boolean;
  readonly pendingModules: readonly string[];
}

/**
 * Fecha o provisionamento quando **todos** os módulos confirmam o seed.
 *
 * O seed é distribuído: cada módulo reage a `tenancy.tenant.created` e semeia o
 * que é dele (categorias do template, templates de e-mail, índice de busca).
 * Como o tenancy não pode olhar dentro dos outros módulos (CLAUDE.md §4.2),
 * a confirmação vem pela fachada — e é ela que sabe quando o tenant pode
 * começar a atender.
 *
 * Confirmar duas vezes é inofensivo: a etapa já está `done` e a ativação só
 * acontece uma vez, porque `changeStatus` sai de `provisioning`.
 */
export class CompleteProvisioning {
  constructor(
    private readonly registry: TenantRegistryPort,
    private readonly steps: ProvisioningStepsPort,
    private readonly events: EventPublisherPort,
    private readonly transaction: TransactionPort,
    private readonly clock: Clock,
    private readonly seedModules: readonly string[] = [],
  ) {}

  async confirmModuleSeed(tenantId: string, moduleName: string): Promise<SeedConfirmation> {
    await this.steps.markDone(tenantId, `seed:${moduleName}`);

    const done = new Set(
      (await this.steps.list(tenantId)).filter((step) => step.status === 'done').map((step) => step.step),
    );
    const pendingModules = this.seedModules.filter((module) => !done.has(`seed:${module}`));

    if (pendingModules.length > 0) {
      return { module: moduleName, activated: false, pendingModules };
    }

    const activated = await this.activate(tenantId);
    return { module: moduleName, activated, pendingModules: [] };
  }

  /** Idempotente: tenant que já saiu de `provisioning` não é ativado de novo. */
  private async activate(tenantId: string): Promise<boolean> {
    return this.transaction.run(async () => {
      const tenants = await this.registry.list();
      const tenant = tenants.find((candidate) => candidate.id === tenantId);
      if (tenant === undefined) throw new NotFoundError('Tenant', { tenantId });
      if (tenant.status !== 'provisioning') return false;

      // trial, e não active: virar `active` depende da assinatura paga
      // (`06-multi-tenancy.md` §9)
      await this.registry.changeStatus(tenantId, 'trial');

      await this.events.publish(
        createDomainEvent(
          {
            type: 'tenancy.tenant.provisioned',
            source: 'mkt/tenancy',
            tenantId,
            subject: `tenant/${tenantId}`,
            data: { tenantId, slug: tenant.slug, seededModules: [...this.seedModules] },
          },
          this.clock,
        ),
      );

      await this.steps.markDone(tenantId, 'module_seeds');
      await this.steps.markDone(tenantId, 'activation');
      return true;
    });
  }
}
