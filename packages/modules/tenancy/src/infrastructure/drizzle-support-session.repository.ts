import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, useTransaction, type DatabaseClient, type DatabasePool } from '@mkt/platform';

import type {
  SupportScope,
  SupportSession,
  SupportSessionRepositoryPort,
} from '../application/support-mode.js';
import { supportSessions } from './tenancy.schema.js';

interface SessionRow {
  id: string;
  tenantId: string;
  staffUserId: string;
  reason: string;
  scope: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const toSession = (row: SessionRow): SupportSession => ({
  id: row.id,
  tenantId: row.tenantId,
  staffUserId: row.staffUserId,
  reason: row.reason,
  scope: row.scope as SupportScope,
  expiresAt: row.expiresAt,
  ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt }),
  createdAt: row.createdAt,
});

/**
 * Sessões de suporte.
 *
 * A tabela tem RLS por tenant e é consultada tanto pelo staff (que ainda não
 * tem TenantContext quando pede acesso) quanto pelo admin do tenant (que tem).
 * Por isso o `app.tenant_id` é definido explicitamente, com o tenant que a
 * própria operação informa.
 */
@Injectable()
export class DrizzleSupportSessionRepository implements SupportSessionRepositoryPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  private async comTenant<T>(tenantId: string, work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return useTransaction(this.pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return work(client);
    });
  }

  async create(session: SupportSession): Promise<void> {
    await this.comTenant(session.tenantId, async (client) => {
      await drizzle(client).insert(supportSessions).values({
        id: session.id,
        tenantId: session.tenantId,
        staffUserId: session.staffUserId,
        reason: session.reason,
        scope: session.scope,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      });
    });
  }

  async findActive(tenantId: string, staffUserId: string, now: Date): Promise<SupportSession | undefined> {
    return this.comTenant(tenantId, async (client) => {
      const [row] = await drizzle(client)
        .select()
        .from(supportSessions)
        .where(
          and(
            eq(supportSessions.tenantId, tenantId),
            eq(supportSessions.staffUserId, staffUserId),
            gt(supportSessions.expiresAt, now),
            isNull(supportSessions.revokedAt),
          ),
        )
        .orderBy(desc(supportSessions.createdAt))
        .limit(1);

      return row === undefined ? undefined : toSession(row as SessionRow);
    });
  }

  async listByTenant(tenantId: string, limit: number): Promise<SupportSession[]> {
    return this.comTenant(tenantId, async (client) => {
      const rows = await drizzle(client)
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.tenantId, tenantId))
        .orderBy(desc(supportSessions.createdAt))
        .limit(limit);

      return rows.map((row) => toSession(row as SessionRow));
    });
  }

  async revoke(tenantId: string, sessionId: string, revokedAt: Date): Promise<void> {
    await this.comTenant(tenantId, async (client) => {
      await drizzle(client)
        .update(supportSessions)
        .set({ revokedAt })
        .where(and(eq(supportSessions.id, sessionId), isNull(supportSessions.revokedAt)));
    });
  }
}
