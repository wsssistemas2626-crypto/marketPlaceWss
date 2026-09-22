import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { IntegrationCategory } from '@mkt/contracts';
import { DATABASE_POOL, TenantAwareRepository, useTransaction, type DatabasePool } from '@mkt/platform';
import { Id, SystemClock } from '@mkt/shared-kernel';

import type {
  ProviderConfigRecord,
  ProviderConfigRepositoryPort,
  ProviderConfigSummary,
} from '../application/provider-config.port.js';
import { CredentialCipher } from './credential-cipher.js';
import { providerConfigs } from './provider-config.schema.js';

export const CREDENTIAL_CIPHER = Symbol('CREDENTIAL_CIPHER');

interface ConfigRow {
  id: string;
  category: string;
  provider: string;
  credentialsEncrypted: string;
  settings: unknown;
  isActive: boolean;
}

/**
 * Persistência das configurações de provedor.
 *
 * As credenciais são decifradas **na leitura** e cifradas na escrita: o texto
 * claro nunca fica no banco e nunca passa por log (CLAUDE.md §4.9).
 */
@Injectable()
export class DrizzleProviderConfigRepository
  extends TenantAwareRepository
  implements ProviderConfigRepositoryPort
{
  private readonly clock = new SystemClock();

  constructor(
    @Inject(DATABASE_POOL) pool: DatabasePool,
    @Inject(CREDENTIAL_CIPHER) private readonly cipher: CredentialCipher,
  ) {
    super(pool);
  }

  private toRecord(row: ConfigRow): ProviderConfigRecord {
    return {
      id: row.id,
      category: row.category as IntegrationCategory,
      provider: row.provider,
      credentials: this.cipher.decrypt(row.credentialsEncrypted),
      settings: (row.settings ?? {}) as Record<string, unknown>,
      isActive: row.isActive,
    };
  }

  async findActive(category: IntegrationCategory): Promise<ProviderConfigRecord | undefined> {
    return this.withTenant(async (client) => {
      const rows = await drizzle(client)
        .select()
        .from(providerConfigs)
        .where(and(eq(providerConfigs.category, category), eq(providerConfigs.isActive, true)))
        .limit(1);

      const row = rows[0];
      return row === undefined ? undefined : this.toRecord(row);
    });
  }

  async list(): Promise<ProviderConfigRecord[]> {
    return this.withTenant(async (client) => {
      const rows = await drizzle(client).select().from(providerConfigs);
      return rows.map((row) => this.toRecord(row));
    });
  }

  /**
   * Resumo de um tenant informado, **sem tocar nas credenciais** (US-081).
   *
   * O console só precisa saber qual provedor está ativo em cada categoria.
   * Decifrar segredo para responder isso seria trabalho e risco à toa — e foi
   * o que quebrou na primeira versão, quando uma credencial de seed inválida
   * derrubou a listagem inteira.
   */
  async listSummaries(tenantId: string): Promise<ProviderConfigSummary[]> {
    return useTransaction(this.pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

      const rows = await drizzle(client)
        .select({
          category: providerConfigs.category,
          provider: providerConfigs.provider,
          isActive: providerConfigs.isActive,
        })
        .from(providerConfigs);

      return rows.map((row) => ({
        category: row.category as IntegrationCategory,
        provider: row.provider,
        isActive: row.isActive,
      }));
    });
  }

  async upsert(input: Omit<ProviderConfigRecord, 'id'> & { id?: string }): Promise<ProviderConfigRecord> {
    const tenantId = this.tenantId;

    return this.withTenant(async (client) => {
      const database = drizzle(client);

      // só um provedor ativo por categoria: desliga os outros antes
      if (input.isActive) {
        await database
          .update(providerConfigs)
          .set({ isActive: false, updatedAt: this.clock.now() })
          .where(eq(providerConfigs.category, input.category));
      }

      const [row] = await database
        .insert(providerConfigs)
        .values({
          id: input.id ?? Id.create(this.clock),
          tenantId,
          category: input.category,
          provider: input.provider,
          credentialsEncrypted: this.cipher.encrypt(input.credentials),
          settings: input.settings,
          isActive: input.isActive,
        })
        .onConflictDoUpdate({
          target: [providerConfigs.tenantId, providerConfigs.category, providerConfigs.provider],
          set: {
            credentialsEncrypted: this.cipher.encrypt(input.credentials),
            settings: input.settings,
            isActive: input.isActive,
            updatedAt: this.clock.now(),
          },
        })
        .returning();

      return this.toRecord(row as ConfigRow);
    });
  }

  async deactivate(category: IntegrationCategory, provider: string): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .update(providerConfigs)
        .set({ isActive: false, updatedAt: this.clock.now() })
        .where(and(eq(providerConfigs.category, category), eq(providerConfigs.provider, provider)));
    });
  }
}
