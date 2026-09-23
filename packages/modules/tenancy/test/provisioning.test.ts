import { describe, expect, it } from 'vitest';

import { FixedClock, ValidationError, type DomainEvent } from '@mkt/shared-kernel';

import { CompleteProvisioning } from '../src/application/complete-provisioning.js';
import {
  ProvisionTenant,
  type EventPublisherPort,
  type ProvisioningStepsPort,
  type StepRecord,
  type TransactionPort,
  type WorkforceProvisioningPort,
} from '../src/application/provision-tenant.js';
import type {
  ProvisionTenantInput,
  TenantRegistryPort,
  TenantSummary,
} from '../src/application/tenant-registry.js';
import { assertValidTenantSlug, isReservedSlug, RESERVED_SLUGS } from '../src/domain/tenant-slug.js';

const clock = new FixedClock('2026-05-01T12:00:00.000Z');

class RegistroEmMemoria implements TenantRegistryPort {
  readonly tenants: TenantSummary[] = [];
  private sequencia = 0;

  async list(): Promise<TenantSummary[]> {
    return this.tenants;
  }

  async findBySlug(slug: string): Promise<TenantSummary | undefined> {
    return this.tenants.find((tenant) => tenant.slug === slug);
  }

  async provision(input: ProvisionTenantInput): Promise<TenantSummary> {
    this.sequencia += 1;
    const tenant: TenantSummary = {
      id: `0193a000-0000-7000-8000-00000000090${this.sequencia}`,
      slug: input.slug,
      name: input.name,
      status: input.status ?? 'trial',
      cell: 'shared-1',
      ...(input.planId === undefined ? {} : { planId: input.planId }),
      hosts: [input.hostname ?? `${input.slug}.localhost`],
    };
    this.tenants.push(tenant);
    return tenant;
  }

  async changeStatus(tenantId: string, status: TenantSummary['status']): Promise<TenantSummary> {
    const indice = this.tenants.findIndex((tenant) => tenant.id === tenantId);
    const atual = this.tenants[indice];
    if (atual === undefined) throw new Error('tenant inexistente no teste');

    const atualizado = { ...atual, status };
    this.tenants[indice] = atualizado;
    return atualizado;
  }
}

class EtapasEmMemoria implements ProvisioningStepsPort {
  readonly registros = new Map<string, StepRecord>();

  private chave(tenantId: string, step: string): string {
    return `${tenantId}:${step}`;
  }

  async list(tenantId: string): Promise<StepRecord[]> {
    return [...this.registros.entries()]
      .filter(([chave]) => chave.startsWith(`${tenantId}:`))
      .map(([, registro]) => registro);
  }

  async markDone(tenantId: string, step: string, detail?: string): Promise<void> {
    this.registros.set(this.chave(tenantId, step), {
      step,
      status: 'done',
      ...(detail === undefined ? {} : { detail }),
    });
  }

  async markFailed(tenantId: string, step: string, detail: string): Promise<void> {
    const atual = this.registros.get(this.chave(tenantId, step));
    if (atual?.status === 'done') return;
    this.registros.set(this.chave(tenantId, step), { step, status: 'failed', detail });
  }
}

class PublicadorEmMemoria implements EventPublisherPort {
  readonly eventos: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.eventos.push(event);
  }
}

class WorkforceEmMemoria implements WorkforceProvisioningPort {
  readonly organizacoes: { tenantId: string; organizationId: string }[] = [];
  readonly convites: { organizationId: string; email: string }[] = [];
  falharNaOrganizacao = false;
  falharNoConvite = false;

  async createTenantOrganization(input: { tenantId: string; name: string }) {
    if (this.falharNaOrganizacao) throw new Error('Clerk fora do ar');

    const organizationId = `org_${this.organizacoes.length + 1}`;
    this.organizacoes.push({ tenantId: input.tenantId, organizationId });
    return { organizationId };
  }

  async linkOrganization(): Promise<void> {
    /* o vínculo é gravado pela fachada do identity; aqui só interessa a ordem */
  }

  async inviteTenantAdmin(input: { organizationId: string; email: string }): Promise<void> {
    if (this.falharNoConvite) throw new Error('e-mail do admin rejeitado');
    this.convites.push(input);
  }
}

/** Transação que sempre commita: o que interessa aqui é a sequência. */
const transacao: TransactionPort = { run: (work) => work() };

function montar(seedModules: string[] = ['template']) {
  const registry = new RegistroEmMemoria();
  const steps = new EtapasEmMemoria();
  const events = new PublicadorEmMemoria();
  const workforce = new WorkforceEmMemoria();

  return {
    registry,
    steps,
    events,
    workforce,
    provision: new ProvisionTenant(registry, steps, workforce, events, transacao, clock, seedModules),
    complete: new CompleteProvisioning(registry, steps, events, transacao, clock, seedModules),
  };
}

const comando = {
  slug: 'loja-x',
  name: 'Loja X',
  planId: 'growth',
  adminEmail: 'admin@loja-x.com.br',
  template: 'moda',
};

describe('slug do tenant (RN-TEN-01)', () => {
  it('aceita slug válido', () => {
    expect(assertValidTenantSlug('loja-x')).toBe('loja-x');
    expect(assertValidTenantSlug('minha-loja-2026')).toBe('minha-loja-2026');
  });

  it('recusa fora do tamanho', () => {
    expect(() => assertValidTenantSlug('ab')).toThrow(ValidationError);
    expect(() => assertValidTenantSlug('a'.repeat(31))).toThrow(ValidationError);
  });

  it('recusa caracteres fora de [a-z0-9-] e hífen nas pontas', () => {
    for (const slug of ['Loja-X', 'loja_x', 'loja x', '-loja', 'loja-', 'loja--x', 'lojá']) {
      expect(() => assertValidTenantSlug(slug), slug).toThrow(ValidationError);
    }
  });

  it('recusa slugs reservados — eles já são subdomínios nossos', () => {
    for (const slug of ['admin', 'api', 'console', 'vendedor', 'www']) {
      expect(() => assertValidTenantSlug(slug), slug).toThrow(ValidationError);
      expect(isReservedSlug(slug)).toBe(true);
    }
    expect(RESERVED_SLUGS).toContain('painel');
    expect(isReservedSlug('loja-x')).toBe(false);
  });
});

describe('ProvisionTenant (US-076)', () => {
  it('registra, publica o evento, cria a organização e convida o admin', async () => {
    const { provision, registry, events, workforce } = montar();

    const resultado = await provision.execute(comando);

    expect(resultado.tenant).toMatchObject({ slug: 'loja-x', status: 'provisioning', planId: 'growth' });
    expect(resultado.executed).toEqual(['registry', 'clerk_organization', 'admin_invite']);

    // o evento sai na mesma operação do registro (é o gatilho dos seeds)
    expect(events.eventos.map((evento) => evento.type)).toEqual(['tenancy.tenant.created']);
    expect(events.eventos[0]?.data).toMatchObject({ slug: 'loja-x', template: 'moda' });

    expect(workforce.organizacoes).toHaveLength(1);
    expect(workforce.convites[0]).toMatchObject({ email: 'admin@loja-x.com.br' });
    expect(registry.tenants[0]?.hosts).toEqual(['loja-x.localhost']);
  });

  it('recusa slug reservado antes de tocar em qualquer coisa', async () => {
    const { provision, registry, events } = montar();

    await expect(provision.execute({ ...comando, slug: 'console' })).rejects.toBeInstanceOf(ValidationError);

    expect(registry.tenants).toEqual([]);
    expect(events.eventos).toEqual([]);
  });

  it('recusa provisionar de novo um tenant que já saiu de provisioning', async () => {
    const { provision, registry } = montar();
    await provision.execute(comando);
    await registry.changeStatus(registry.tenants[0]!.id, 'trial');

    await expect(provision.execute(comando)).rejects.toThrow(/Já existe um tenant/);
  });

  describe('falha parcial e retomada (2º cenário do Gherkin)', () => {
    it('reexecutar refaz só o que faltou, sem duplicar', async () => {
      const { provision, registry, events, workforce, steps } = montar();
      workforce.falharNoConvite = true;

      // primeira tentativa: registro e organização passam, convite falha
      await expect(provision.execute(comando)).rejects.toThrow('e-mail do admin rejeitado');

      const tenantId = registry.tenants[0]!.id;
      expect((await steps.list(tenantId)).find((s) => s.step === 'admin_invite')?.status).toBe('failed');
      expect(registry.tenants).toHaveLength(1);

      // segunda tentativa, já com a Clerk respondendo
      workforce.falharNoConvite = false;
      const resultado = await provision.execute(comando);

      // nada de tenant duplicado, nem organização duplicada, nem evento repetido
      expect(registry.tenants).toHaveLength(1);
      expect(workforce.organizacoes).toHaveLength(1);
      expect(events.eventos).toHaveLength(1);
      // e só a etapa pendente foi executada
      expect(resultado.executed).toEqual(['admin_invite']);
      expect(resultado.steps.every((step) => step.step.startsWith('seed:') || step.status === 'done')).toBe(
        true,
      );
    });

    it('falha na criação da organização também é retomável', async () => {
      const { provision, registry, workforce } = montar();
      workforce.falharNaOrganizacao = true;

      await expect(provision.execute(comando)).rejects.toThrow('Clerk fora do ar');

      workforce.falharNaOrganizacao = false;
      const resultado = await provision.execute(comando);

      expect(resultado.executed).toEqual(['clerk_organization', 'admin_invite']);
      expect(registry.tenants).toHaveLength(1);
    });
  });
});

describe('CompleteProvisioning — ativação depois dos seeds', () => {
  it('só ativa quando todos os módulos confirmam', async () => {
    const { provision, complete, registry, events } = montar(['template', 'catalog']);
    await provision.execute(comando);
    const tenantId = registry.tenants[0]!.id;

    const primeira = await complete.confirmModuleSeed(tenantId, 'template');
    expect(primeira).toMatchObject({ activated: false, pendingModules: ['catalog'] });
    expect(registry.tenants[0]?.status).toBe('provisioning');

    const segunda = await complete.confirmModuleSeed(tenantId, 'catalog');
    expect(segunda).toMatchObject({ activated: true, pendingModules: [] });

    // trial, não active: virar active depende da assinatura paga
    expect(registry.tenants[0]?.status).toBe('trial');
    expect(events.eventos.map((evento) => evento.type)).toEqual([
      'tenancy.tenant.created',
      'tenancy.tenant.provisioned',
    ]);
  });

  it('confirmar duas vezes não ativa duas vezes', async () => {
    const { provision, complete, registry, events } = montar(['template']);
    await provision.execute(comando);
    const tenantId = registry.tenants[0]!.id;

    await complete.confirmModuleSeed(tenantId, 'template');
    const repetida = await complete.confirmModuleSeed(tenantId, 'template');

    expect(repetida.activated).toBe(false);
    expect(events.eventos.filter((evento) => evento.type === 'tenancy.tenant.provisioned')).toHaveLength(1);
  });

  it('sem módulos a semear, o primeiro confirm ativa', async () => {
    const { provision, complete, registry } = montar([]);
    await provision.execute(comando);
    const tenantId = registry.tenants[0]!.id;

    const resultado = await complete.confirmModuleSeed(tenantId, 'qualquer');

    expect(resultado.activated).toBe(true);
    expect(registry.tenants[0]?.status).toBe('trial');
  });
});
