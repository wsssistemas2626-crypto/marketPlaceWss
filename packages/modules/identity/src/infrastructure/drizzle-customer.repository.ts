import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, enqueueOutboxEvent, TenantAwareRepository, type DatabasePool } from '@mkt/platform';
import { type DomainEvent, Id, SystemClock } from '@mkt/shared-kernel';

import type { CustomerRepositoryPort, EmailVerification } from '../application/customers/ports.js';
import type { CustomerCredentialsPort, LoginRecord } from '../application/customers/session-ports.js';
import {
  Customer,
  type ConsentKind,
  type CustomerSnapshot,
  type CustomerStatus,
} from '../domain/customer/customer.js';
import type { LoginThrottleState } from '../domain/customer/login-throttle.js';
import { customerConsents, customerEmailVerifications, customers } from './identity.schema.js';

/** Violação de unicidade do Postgres, venha ela crua ou embrulhada pelo Drizzle. */
const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
};

type CustomerRow = typeof customers.$inferSelect;

/**
 * Compradores no Postgres (US-010). Tudo roda no tenant do contexto: a RLS
 * garante que um e-mail de outra loja nunca aparece — nem para dizer que
 * "já existe".
 */
@Injectable()
export class DrizzleCustomerRepository
  extends TenantAwareRepository
  implements CustomerRepositoryPort, CustomerCredentialsPort
{
  private readonly clock = new SystemClock();

  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async findByEmail(email: string): Promise<Customer | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client).select().from(customers).where(eq(customers.email, email)).limit(1);
      return row === undefined ? undefined : this.toCustomer(row);
    });
  }

  async findById(id: string): Promise<Customer | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client).select().from(customers).where(eq(customers.id, id)).limit(1);
      return row === undefined ? undefined : this.toCustomer(row);
    });
  }

  async create(
    customer: Customer,
    verification: EmailVerification,
    event: DomainEvent,
  ): Promise<'created' | 'email_taken'> {
    const snapshot = customer.toSnapshot();

    try {
      await this.withTenant(async (client) => {
        const database = drizzle(client);

        await database.insert(customers).values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          name: snapshot.name,
          email: snapshot.email,
          documentType: snapshot.document.type,
          documentNumber: snapshot.document.number,
          passwordHash: snapshot.passwordHash,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        });

        await database.insert(customerConsents).values(
          snapshot.consents.map((consent) => ({
            id: Id.create(this.clock),
            tenantId: snapshot.tenantId,
            customerId: snapshot.id,
            kind: consent.kind,
            version: consent.version,
            acceptedAt: consent.acceptedAt,
            ip: consent.ip,
          })),
        );

        await database.insert(customerEmailVerifications).values({
          tokenHash: verification.tokenHash,
          tenantId: snapshot.tenantId,
          customerId: snapshot.id,
          expiresAt: verification.expiresAt,
        });

        await enqueueOutboxEvent(client, 'identity', event);
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'email_taken';
      throw error;
    }

    return 'created';
  }

  async addVerification(verification: EmailVerification): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client).insert(customerEmailVerifications).values({
        tokenHash: verification.tokenHash,
        tenantId: this.tenantId,
        customerId: verification.customerId,
        expiresAt: verification.expiresAt,
      });
    });
  }

  async findVerification(tokenHash: string): Promise<EmailVerification | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client)
        .select()
        .from(customerEmailVerifications)
        .where(eq(customerEmailVerifications.tokenHash, tokenHash))
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

  async confirmEmail(customer: Customer, tokenHash: string, usedAt: Date, event: DomainEvent): Promise<void> {
    const snapshot = customer.toSnapshot();

    await this.withTenant(async (client) => {
      const database = drizzle(client);

      // consome o token só se ainda não foi usado: dois cliques simultâneos não ativam duas vezes
      const consumed = await database
        .update(customerEmailVerifications)
        .set({ usedAt })
        .where(
          and(eq(customerEmailVerifications.tokenHash, tokenHash), isNull(customerEmailVerifications.usedAt)),
        )
        .returning({ tokenHash: customerEmailVerifications.tokenHash });

      if (consumed.length === 0) return;

      await database
        .update(customers)
        .set({
          status: snapshot.status,
          emailVerifiedAt: snapshot.emailVerifiedAt ?? null,
          updatedAt: snapshot.updatedAt,
        })
        .where(eq(customers.id, snapshot.id));

      await enqueueOutboxEvent(client, 'identity', event);
    });
  }

  async findLoginRecord(email: string): Promise<LoginRecord | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client).select().from(customers).where(eq(customers.email, email)).limit(1);
      if (row === undefined) return undefined;

      return {
        customer: this.toCustomer(row),
        throttle: {
          failedAttempts: row.failedLoginAttempts,
          ...(row.lockedUntil === null ? {} : { lockedUntil: row.lockedUntil }),
        },
      };
    });
  }

  async saveThrottle(customerId: string, state: LoginThrottleState): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .update(customers)
        .set({ failedLoginAttempts: state.failedAttempts, lockedUntil: state.lockedUntil ?? null })
        .where(eq(customers.id, customerId));
    });
  }

  async updatePasswordHash(customerId: string, passwordHash: string): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .update(customers)
        .set({ passwordHash, updatedAt: this.clock.now() })
        .where(eq(customers.id, customerId));
    });
  }

  private toCustomer(row: CustomerRow): Customer {
    const snapshot: CustomerSnapshot = {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      email: row.email,
      document: { type: row.documentType as 'cpf' | 'cnpj', number: row.documentNumber },
      passwordHash: row.passwordHash,
      status: row.status as CustomerStatus,
      ...(row.emailVerifiedAt === null ? {} : { emailVerifiedAt: row.emailVerifiedAt }),
      // consentimentos são histórico, não estado do agregado: lidos só quando alguém precisa deles
      consents: [] as { kind: ConsentKind; version: string; acceptedAt: Date; ip: string }[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    return Customer.restore(snapshot);
  }
}
