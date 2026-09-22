import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import {
  DATABASE_POOL,
  normalizeHost,
  withTransaction,
  type DatabasePool,
  type TenantDirectoryPort,
  type TenantRecord,
  type TenantStatus,
} from '@mkt/platform';

import { domains, tenants } from './tenancy.schema.js';

interface CacheEntry {
  readonly record: TenantRecord | undefined;
  readonly expiresAt: number;
}

/** TTL do cache de resolução de tenant (`06-multi-tenancy.md` §2). */
const CACHE_TTL_MS = 60_000;

/**
 * Registro de tenants com banco + cache em memória.
 *
 * Roda **sem** TenantContext de propósito: é esta consulta que descobre o
 * tenant. As tabelas do schema `tenancy` são o registro da plataforma e por
 * isso ficam fora do RLS (exceção documentada em `06-multi-tenancy.md` §3.3).
 *
 * O cache curto existe porque toda requisição do storefront passa por aqui;
 * 60 s é o suficiente para não martelar o banco sem atrasar demais a troca de
 * status de um tenant (suspensão, por exemplo).
 */
@Injectable()
export class DbTenantDirectory implements TenantDirectoryPort {
  private readonly byHost = new Map<string, CacheEntry>();
  private readonly byId = new Map<string, CacheEntry>();

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  /** Seam de tempo para teste; em produção é sempre o relógio do sistema. */
  now: () => number = () => Date.now();

  private fresh(cache: Map<string, CacheEntry>, key: string): CacheEntry | undefined {
    const entry = cache.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry;
  }

  private remember(cache: Map<string, CacheEntry>, key: string, record: TenantRecord | undefined): void {
    cache.set(key, { record, expiresAt: this.now() + CACHE_TTL_MS });
  }

  private async load(tenantId: string): Promise<TenantRecord | undefined> {
    return withTransaction(this.pool, async (client) => {
      const database = drizzle(client);

      const [tenant] = await database.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (tenant === undefined) return undefined;

      const hosts = await database
        .select({ hostname: domains.hostname })
        .from(domains)
        .where(eq(domains.tenantId, tenantId));

      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        status: tenant.status as TenantStatus,
        cell: tenant.cell,
        hosts: hosts.map((row) => row.hostname),
      };
    });
  }

  async findByHost(host: string): Promise<TenantRecord | undefined> {
    const hostname = normalizeHost(host);
    const cached = this.fresh(this.byHost, hostname);
    if (cached !== undefined) return cached.record;

    const record = await withTransaction(this.pool, async (client) => {
      const [row] = await drizzle(client)
        .select({ tenantId: domains.tenantId })
        .from(domains)
        .where(eq(domains.hostname, hostname))
        .limit(1);

      return row === undefined ? undefined : await this.load(row.tenantId);
    });

    this.remember(this.byHost, hostname, record);
    if (record !== undefined) this.remember(this.byId, record.tenantId, record);
    return record;
  }

  async findById(tenantId: string): Promise<TenantRecord | undefined> {
    const cached = this.fresh(this.byId, tenantId);
    if (cached !== undefined) return cached.record;

    const record = await this.load(tenantId);
    this.remember(this.byId, tenantId, record);
    return record;
  }

  /** Usado após criar/alterar um tenant, para não esperar o TTL. */
  invalidate(): void {
    this.byHost.clear();
    this.byId.clear();
  }
}
