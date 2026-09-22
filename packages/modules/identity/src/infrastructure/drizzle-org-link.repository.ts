import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { OrganizationKind } from '@mkt/contracts';
import { DATABASE_POOL, withTransaction, type DatabasePool } from '@mkt/platform';
import { SystemClock } from '@mkt/shared-kernel';

import type { OrgLink, OrgLinkRepositoryPort } from '../application/panel-session.js';
import { orgLinks, workforceUsers } from './org-link.schema.js';

/**
 * Repositório do vínculo organização → tenant.
 *
 * Usa `withTransaction` (sem tenant) de propósito: esta é a tabela consultada
 * **antes** de existir TenantContext, justamente para descobrir o tenant. É a
 * exceção documentada em `06-multi-tenancy.md` §3.3 — e por isso aqui não há
 * nenhum dado de negócio, só o vínculo.
 */
@Injectable()
export class DrizzleOrgLinkRepository implements OrgLinkRepositoryPort {
  private readonly clock = new SystemClock();

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async findByOrgId(clerkOrgId: string): Promise<OrgLink | undefined> {
    return withTransaction(this.pool, async (client) => {
      const rows = await drizzle(client)
        .select()
        .from(orgLinks)
        .where(eq(orgLinks.clerkOrgId, clerkOrgId))
        .limit(1);

      const row = rows[0];
      if (row === undefined) return undefined;

      return {
        clerkOrgId: row.clerkOrgId,
        kind: row.kind as OrganizationKind,
        tenantId: row.tenantId,
        ...(row.sellerId === null ? {} : { sellerId: row.sellerId }),
        status: row.status as OrgLink['status'],
      };
    });
  }

  async upsert(link: OrgLink): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await drizzle(client)
        .insert(orgLinks)
        .values({
          clerkOrgId: link.clerkOrgId,
          kind: link.kind,
          tenantId: link.tenantId,
          sellerId: link.sellerId ?? null,
          status: link.status,
        })
        .onConflictDoUpdate({
          target: orgLinks.clerkOrgId,
          set: {
            kind: link.kind,
            tenantId: link.tenantId,
            sellerId: link.sellerId ?? null,
            status: link.status,
            updatedAt: this.clock.now(),
          },
        });
    });
  }

  async upsertUser(user: { clerkUserId: string; email: string; name?: string }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await drizzle(client)
        .insert(workforceUsers)
        .values({ clerkUserId: user.clerkUserId, email: user.email, name: user.name ?? null })
        .onConflictDoUpdate({
          target: workforceUsers.clerkUserId,
          set: { email: user.email, name: user.name ?? null, updatedAt: this.clock.now() },
        });
    });
  }
}
