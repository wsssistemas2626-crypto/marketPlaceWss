import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import {
  DATABASE_POOL,
  normalizeHost,
  withTransaction,
  type DatabasePool,
  type TenantStatus,
} from '@mkt/platform';
import { ConflictError, Id, SystemClock } from '@mkt/shared-kernel';

import type {
  ProvisionTenantInput,
  TenantRegistryPort,
  TenantSummary,
} from '../application/tenant-registry.js';
import { DbTenantDirectory } from './db-tenant-directory.js';
import { domains, tenants } from './tenancy.schema.js';

/**
 * Registro de tenants no banco.
 *
 * Roda sem TenantContext: é operação de **plataforma**, feita pelo staff no
 * console (rotas `/v1/platform/*`, CLAUDE.md §5).
 */
@Injectable()
export class DrizzleTenantRegistry implements TenantRegistryPort {
  private readonly clock = new SystemClock();

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    private readonly directory: DbTenantDirectory,
    /** Domínio raiz da plataforma, para montar `{slug}.{raiz}`. */
    private readonly rootDomain: string = process.env.PLATFORM_ROOT_DOMAIN ?? 'localhost',
  ) {}

  private async hydrate(tenantId: string): Promise<TenantSummary> {
    return withTransaction(this.pool, async (client) => {
      const database = drizzle(client);
      const [tenant] = await database.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (tenant === undefined) throw new ConflictError('Tenant desapareceu durante a operação');

      const hosts = await database
        .select({ hostname: domains.hostname })
        .from(domains)
        .where(eq(domains.tenantId, tenantId));

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status as TenantStatus,
        cell: tenant.cell,
        ...(tenant.planId === null ? {} : { planId: tenant.planId }),
        hosts: hosts.map((row) => row.hostname),
      };
    });
  }

  async list(): Promise<TenantSummary[]> {
    const rows = await withTransaction(this.pool, (client) =>
      drizzle(client).select({ id: tenants.id }).from(tenants).orderBy(tenants.slug),
    );

    return Promise.all(rows.map((row) => this.hydrate(row.id)));
  }

  async findBySlug(slug: string): Promise<TenantSummary | undefined> {
    const [row] = await withTransaction(this.pool, (client) =>
      drizzle(client).select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1),
    );

    return row === undefined ? undefined : this.hydrate(row.id);
  }

  async provision(input: ProvisionTenantInput): Promise<TenantSummary> {
    const existing = await this.findBySlug(input.slug);
    if (existing !== undefined) {
      throw new ConflictError(`Já existe um tenant com o slug "${input.slug}"`, { slug: input.slug });
    }

    const tenantId = Id.create(this.clock);
    const hostname = normalizeHost(input.hostname ?? `${input.slug}.${this.rootDomain}`);

    await withTransaction(this.pool, async (client) => {
      const database = drizzle(client);

      await database.insert(tenants).values({
        id: tenantId,
        slug: input.slug,
        name: input.name,
        // nasce em trial: já atende requisição, mas o ciclo de vida fica explícito
        status: 'trial',
        cell: 'shared-1',
        planId: input.planId ?? null,
      });

      await database.insert(domains).values({
        id: Id.create(this.clock),
        tenantId,
        hostname,
        isPrimary: true,
        verifiedAt: this.clock.now(),
      });
    });

    this.directory.invalidate();
    return this.hydrate(tenantId);
  }

  async changeStatus(tenantId: string, status: TenantStatus): Promise<TenantSummary> {
    await withTransaction(this.pool, (client) =>
      drizzle(client)
        .update(tenants)
        .set({ status, updatedAt: this.clock.now() })
        .where(eq(tenants.id, tenantId)),
    );

    // sem isto, uma suspensão só valeria depois do TTL do cache
    this.directory.invalidate();
    return this.hydrate(tenantId);
  }
}
