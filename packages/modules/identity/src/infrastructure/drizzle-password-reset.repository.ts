import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, TenantAwareRepository, type DatabasePool } from '@mkt/platform';

import type {
  PasswordResetRecord,
  PasswordResetRepositoryPort,
} from '../application/customers/password-reset.js';
import { customerPasswordResets, customerRefreshTokens, customers } from './identity.schema.js';

/** Pedidos de troca de senha (US-012), com RLS: link de outra loja não existe aqui. */
@Injectable()
export class DrizzlePasswordResetRepository
  extends TenantAwareRepository
  implements PasswordResetRepositoryPort
{
  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async open(record: PasswordResetRecord, at: Date): Promise<void> {
    await this.withTenant(async (client) => {
      const database = drizzle(client);

      // link novo invalida os anteriores: só o último e-mail vale
      await database
        .update(customerPasswordResets)
        .set({ usedAt: at })
        .where(
          and(
            eq(customerPasswordResets.customerId, record.customerId),
            isNull(customerPasswordResets.usedAt),
          ),
        );

      await database.insert(customerPasswordResets).values({
        tokenHash: record.tokenHash,
        tenantId: this.tenantId,
        customerId: record.customerId,
        expiresAt: record.expiresAt,
      });
    });
  }

  async findByHash(tokenHash: string): Promise<PasswordResetRecord | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client)
        .select()
        .from(customerPasswordResets)
        .where(eq(customerPasswordResets.tokenHash, tokenHash))
        .limit(1);

      if (row === undefined) return undefined;
      return {
        customerId: row.customerId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        ...(row.usedAt === null ? {} : { usedAt: row.usedAt }),
      };
    });
  }

  async complete(input: {
    customerId: string;
    tokenHash: string;
    passwordHash: string;
    at: Date;
  }): Promise<'completed' | 'already_used'> {
    return this.withTenant(async (client) => {
      const database = drizzle(client);

      const consumed = await database
        .update(customerPasswordResets)
        .set({ usedAt: input.at })
        .where(
          and(eq(customerPasswordResets.tokenHash, input.tokenHash), isNull(customerPasswordResets.usedAt)),
        )
        .returning({ tokenHash: customerPasswordResets.tokenHash });

      if (consumed.length === 0) return 'already_used';

      await database
        .update(customers)
        .set({
          passwordHash: input.passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: input.at,
        })
        .where(eq(customers.id, input.customerId));

      // RF-IAM-04: trocar a senha derruba todas as sessões
      await database
        .update(customerRefreshTokens)
        .set({ revokedAt: input.at })
        .where(
          and(
            eq(customerRefreshTokens.customerId, input.customerId),
            isNull(customerRefreshTokens.revokedAt),
          ),
        );

      return 'completed';
    });
  }
}
