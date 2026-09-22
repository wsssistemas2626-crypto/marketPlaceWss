import { describe, expect, it } from 'vitest';

import { FixedClock, NotFoundError, ValidationError, type DomainEvent } from '@mkt/shared-kernel';

import { ChangeTenantStatus } from '../src/application/change-tenant-status.js';
import type { EventPublisherPort, TransactionPort } from '../src/application/provision-tenant.js';
import {
  MAX_SUPPORT_DURATION_MINUTES,
  SupportMode,
  type SupportSession,
  type SupportSessionRepositoryPort,
} from '../src/application/support-mode.js';
import type {
  ProvisionTenantInput,
  TenantRegistryPort,
  TenantSummary,
} from '../src/application/tenant-registry.js';

const TENANT = '0193a000-0000-7000-8000-00000000000a';

class RepositorioDeSessoes implements SupportSessionRepositoryPort {
  readonly sessoes: SupportSession[] = [];

  async create(session: SupportSession): Promise<void> {
    this.sessoes.push(session);
  }

  async findActive(tenantId: string, staffUserId: string, now: Date): Promise<SupportSession | undefined> {
    return this.sessoes.find(
      (sessao) =>
        sessao.tenantId === tenantId &&
        sessao.staffUserId === staffUserId &&
        sessao.expiresAt > now &&
        sessao.revokedAt === undefined,
    );
  }

  async listByTenant(tenantId: string, limit: number): Promise<SupportSession[]> {
    return this.sessoes.filter((sessao) => sessao.tenantId === tenantId).slice(0, limit);
  }

  async revoke(tenantId: string, sessionId: string, revokedAt: Date): Promise<void> {
    const indice = this.sessoes.findIndex((sessao) => sessao.id === sessionId);
    const atual = this.sessoes[indice];
    if (atual !== undefined) this.sessoes[indice] = { ...atual, revokedAt };
  }
}

describe('modo suporte (US-080 / RF-TEN-07)', () => {
  const abrir = () => {
    const clock = new FixedClock('2026-06-01T10:00:00.000Z');
    const repositorio = new RepositorioDeSessoes();
    return { clock, repositorio, support: new SupportMode(repositorio, clock) };
  };

  it('abre sessão com motivo, prazo e somente leitura por padrão', async () => {
    const { support } = abrir();

    const sessao = await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'investigar pedido travado #4821',
    });

    expect(sessao.scope).toBe('read_only');
    expect(sessao.expiresAt.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });

  it('exige motivo — auditoria sem motivo não explica nada', async () => {
    const { support, repositorio } = abrir();

    await expect(
      support.open({ tenantId: TENANT, staffUserId: 'staff_1', reason: 'suporte' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repositorio.sessoes).toEqual([]);
  });

  it('recusa prazo acima de 2 horas', async () => {
    const { support } = abrir();

    await expect(
      support.open({
        tenantId: TENANT,
        staffUserId: 'staff_1',
        reason: 'preciso de acesso permanente',
        durationMinutes: MAX_SUPPORT_DURATION_MINUTES + 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('escrita precisa ser pedida explicitamente', async () => {
    const { support } = abrir();

    const sessao = await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'corrigir endereço do pedido a pedido do cliente',
      scope: 'write',
    });

    expect(sessao.scope).toBe('write');
  });

  it('sessão expirada deixa de valer', async () => {
    const { support, clock } = abrir();
    await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'investigar pedido travado #4821',
      durationMinutes: 30,
    });

    expect(await support.findActive(TENANT, 'staff_1')).toBeDefined();

    clock.advance(31 * 60_000);
    expect(await support.findActive(TENANT, 'staff_1')).toBeUndefined();
  });

  it('revogar encerra o acesso na hora', async () => {
    const { support } = abrir();
    const sessao = await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'investigar pedido travado #4821',
    });

    await support.revoke(TENANT, sessao.id);

    expect(await support.findActive(TENANT, 'staff_1')).toBeUndefined();
  });

  it('o admin do tenant enxerga os acessos (o outro lado do §7)', async () => {
    const { support } = abrir();
    await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'investigar pedido travado #4821',
    });

    const historico = await support.listByTenant(TENANT);

    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ staffUserId: 'staff_1', reason: 'investigar pedido travado #4821' });
  });

  it('sessão de um tenant não vale no outro', async () => {
    const { support } = abrir();
    await support.open({
      tenantId: TENANT,
      staffUserId: 'staff_1',
      reason: 'investigar pedido travado #4821',
    });

    expect(await support.findActive('0193a000-0000-7000-8000-00000000000b', 'staff_1')).toBeUndefined();
  });
});

describe('mudança de status do tenant (US-080 / RF-TEN-06)', () => {
  class RegistroEmMemoria implements TenantRegistryPort {
    constructor(public tenant: TenantSummary) {}

    async list(): Promise<TenantSummary[]> {
      return [this.tenant];
    }

    async findBySlug(): Promise<TenantSummary | undefined> {
      return this.tenant;
    }

    async provision(input: ProvisionTenantInput): Promise<TenantSummary> {
      return { ...this.tenant, slug: input.slug };
    }

    async changeStatus(_tenantId: string, status: TenantSummary['status']): Promise<TenantSummary> {
      this.tenant = { ...this.tenant, status };
      return this.tenant;
    }
  }

  class PublicadorEmMemoria implements EventPublisherPort {
    readonly eventos: DomainEvent[] = [];

    async publish(event: DomainEvent): Promise<void> {
      this.eventos.push(event);
    }
  }

  const transacao: TransactionPort = { run: (work) => work() };

  const montar = (status: TenantSummary['status']) => {
    const registry = new RegistroEmMemoria({
      id: TENANT,
      slug: 'loja-a',
      name: 'Loja A',
      status,
      cell: 'shared-1',
      hosts: ['loja-a.localhost'],
    });
    const events = new PublicadorEmMemoria();

    return {
      registry,
      events,
      useCase: new ChangeTenantStatus(registry, events, transacao, new FixedClock()),
    };
  };

  it('suspende e publica o evento com o motivo', async () => {
    const { useCase, registry, events } = montar('active');

    await useCase.execute({ tenantId: TENANT, status: 'suspended', reason: 'inadimplência de 60 dias' });

    expect(registry.tenant.status).toBe('suspended');
    expect(events.eventos[0]?.type).toBe('tenancy.tenant.status_changed');
    expect(events.eventos[0]?.data).toMatchObject({
      from: 'active',
      to: 'suspended',
      reason: 'inadimplência de 60 dias',
    });
  });

  it('reativa um tenant suspenso', async () => {
    const { useCase, registry } = montar('suspended');

    await useCase.execute({ tenantId: TENANT, status: 'active' });

    expect(registry.tenant.status).toBe('active');
  });

  it('recusa transição inválida — cancelado não volta', async () => {
    const { useCase, events } = montar('cancelled');

    await expect(useCase.execute({ tenantId: TENANT, status: 'active' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(events.eventos).toEqual([]);
  });

  it('mudar para o mesmo status não publica evento', async () => {
    const { useCase, events } = montar('active');

    await useCase.execute({ tenantId: TENANT, status: 'active' });

    expect(events.eventos).toEqual([]);
  });

  it('tenant inexistente é 404', async () => {
    const { useCase } = montar('active');

    await expect(
      useCase.execute({ tenantId: '0193a000-0000-7000-8000-0000000009ff', status: 'suspended' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
