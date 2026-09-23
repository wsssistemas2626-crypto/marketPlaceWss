import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, useTransaction, type DatabaseClient, type DatabasePool } from '@mkt/platform';

import {
  EMPTY_USAGE,
  type TenantUsage,
  type UsageMetric,
  type UsageProjectionPort,
} from '../application/tenant-usage.js';
import { tenantUsage } from './tenancy.schema.js';

/**
 * Projeção de uso no banco.
 *
 * `INSERT … ON CONFLICT DO UPDATE SET value = value + delta` é atômico: dois
 * eventos do mesmo tenant chegando ao mesmo tempo não se perdem.
 */
@Injectable()
export class DrizzleUsageProjection implements UsageProjectionPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  private async comTenant<T>(tenantId: string, work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return useTransaction(this.pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      return work(client);
    });
  }

  async increment(tenantId: string, metric: UsageMetric, delta: number): Promise<void> {
    await this.comTenant(tenantId, async (client) => {
      await drizzle(client)
        .insert(tenantUsage)
        .values({ tenantId, metric, value: delta })
        .onConflictDoUpdate({
          target: [tenantUsage.tenantId, tenantUsage.metric],
          set: {
            value: sql`${tenantUsage.value} + ${delta}`,
            updatedAt: new Date(),
          },
        });
    });
  }

  async get(tenantId: string): Promise<TenantUsage> {
    const rows = await this.comTenant(tenantId, (client) =>
      drizzle(client).select().from(tenantUsage).where(eq(tenantUsage.tenantId, tenantId)),
    );

    return rows.reduce<TenantUsage>((total, row) => ({ ...total, [row.metric]: Number(row.value) }), {
      ...EMPTY_USAGE,
    });
  }
}
