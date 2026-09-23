import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, TenantAwareRepository, type DatabasePool } from '@mkt/platform';

import type {
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from '../application/customers/session-ports.js';
import { customerRefreshTokens } from './identity.schema.js';

type Row = typeof customerRefreshTokens.$inferSelect;

const toRecord = (row: Row): RefreshTokenRecord => ({
  id: row.id,
  customerId: row.customerId,
  familyId: row.familyId,
  tokenHash: row.tokenHash,
  expiresAt: row.expiresAt,
  ...(row.usedAt === null ? {} : { usedAt: row.usedAt }),
  ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt }),
});

/** Refresh tokens do comprador (US-011), com RLS: token de outra loja não existe aqui. */
@Injectable()
export class DrizzleRefreshTokenRepository
  extends TenantAwareRepository
  implements RefreshTokenRepositoryPort
{
  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async create(record: RefreshTokenRecord): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .insert(customerRefreshTokens)
        .values({ ...record, tenantId: this.tenantId });
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client)
        .select()
        .from(customerRefreshTokens)
        .where(eq(customerRefreshTokens.tokenHash, tokenHash))
        .limit(1);
      return row === undefined ? undefined : toRecord(row);
    });
  }

  async rotate(
    previousId: string,
    usedAt: Date,
    next: RefreshTokenRecord,
  ): Promise<'rotated' | 'already_used'> {
    return this.withTenant(async (client) => {
      const database = drizzle(client);

      // o UPDATE condicional é a trava: só um dos refreshes concorrentes consome o token
      const consumed = await database
        .update(customerRefreshTokens)
        .set({ usedAt })
        .where(
          and(
            eq(customerRefreshTokens.id, previousId),
            isNull(customerRefreshTokens.usedAt),
            isNull(customerRefreshTokens.revokedAt),
          ),
        )
        .returning({ id: customerRefreshTokens.id });

      if (consumed.length === 0) return 'already_used';

      await database.insert(customerRefreshTokens).values({ ...next, tenantId: this.tenantId });
      return 'rotated';
    });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .update(customerRefreshTokens)
        .set({ revokedAt: at })
        .where(and(eq(customerRefreshTokens.familyId, familyId), isNull(customerRefreshTokens.revokedAt)));
    });
  }

  async revokeAllOf(customerId: string, at: Date): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .update(customerRefreshTokens)
        .set({ revokedAt: at })
        .where(
          and(eq(customerRefreshTokens.customerId, customerId), isNull(customerRefreshTokens.revokedAt)),
        );
    });
  }
}
