import { Inject, Injectable } from '@nestjs/common';

import type { WorkforceIdentityPort } from '@mkt/contracts';
import { ORG_LINK_REPOSITORY, WORKFORCE_IDENTITY, type OrgLinkRepositoryPort } from '@mkt/modules-identity';
import {
  DATABASE_POOL,
  enqueueOutboxEvent,
  useTransaction,
  withTransaction,
  type DatabasePool,
} from '@mkt/platform';
import type { DomainEvent } from '@mkt/shared-kernel';

import type {
  EventPublisherPort,
  TransactionPort,
  WorkforceProvisioningPort,
} from '../application/provision-tenant.js';

/** Unidade de trabalho de plataforma (sem tenant, como o resto do `tenancy`). */
@Injectable()
export class TenancyTransaction implements TransactionPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    return withTransaction(this.pool, () => work());
  }
}

/**
 * Publica na `tenancy.outbox` usando a transação em andamento.
 *
 * A tabela tem RLS por tenant, mas a escrita aqui acontece **sem**
 * TenantContext (o tenant está nascendo), então a inserção usa o role `app`
 * com `SET LOCAL` do próprio tenant recém-criado.
 */
@Injectable()
export class TenancyOutboxPublisher implements EventPublisherPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async publish(event: DomainEvent): Promise<void> {
    await useTransaction(this.pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', event.tenantId]);
      await enqueueOutboxEvent(client, 'tenancy', event);
    });
  }
}

/**
 * Cria a organização do tenant na Clerk e grava o vínculo.
 *
 * O vínculo é gravado pela fachada do módulo `identity` — o `tenancy` não
 * escreve na tabela do outro módulo (CLAUDE.md §4.2).
 */
@Injectable()
export class ClerkTenantProvisioning implements WorkforceProvisioningPort {
  constructor(
    @Inject(WORKFORCE_IDENTITY) private readonly identity: WorkforceIdentityPort,
    @Inject(ORG_LINK_REPOSITORY) private readonly links: OrgLinkRepositoryPort,
  ) {}

  async createTenantOrganization(input: {
    tenantId: string;
    name: string;
  }): Promise<{ organizationId: string }> {
    return this.identity.createOrganization({
      name: input.name,
      kind: 'tenant',
      tenantId: input.tenantId,
    });
  }

  async linkOrganization(input: { organizationId: string; tenantId: string }): Promise<void> {
    await this.links.upsert({
      clerkOrgId: input.organizationId,
      kind: 'tenant',
      tenantId: input.tenantId,
      status: 'active',
    });
  }

  async inviteTenantAdmin(input: { organizationId: string; email: string }): Promise<void> {
    // papel da tabela de RBAC do ADR-013
    await this.identity.inviteMember({
      organizationId: input.organizationId,
      email: input.email,
      role: 'org:tenant_admin',
    });
  }
}
