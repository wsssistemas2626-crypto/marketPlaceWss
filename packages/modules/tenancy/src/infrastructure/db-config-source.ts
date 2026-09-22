import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import {
  DATABASE_POOL,
  withTenantTx,
  withTransaction,
  type ConfigSourcePort,
  type ConfigValue,
  type DatabasePool,
  type Entitlements,
  type PlanDefinition,
} from '@mkt/platform';

import { plans, tenants, tenantSettings } from './tenancy.schema.js';

/**
 * Fonte de configuração com banco (US-073 + US-075).
 *
 * Os padrões da plataforma ficam no plano `platform-defaults`, para que mudar
 * um padrão não exija deploy. As sobreposições do tenant são lidas dentro de
 * `withTenantTx` — ou seja, com RLS valendo.
 */
@Injectable()
export class DbConfigSource implements ConfigSourcePort {
  static readonly PLATFORM_DEFAULTS_PLAN = 'platform-defaults';

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async platformDefaults(): Promise<Record<string, ConfigValue>> {
    return withTransaction(this.pool, async (client) => {
      const [row] = await drizzle(client)
        .select({ settings: plans.settings })
        .from(plans)
        .where(eq(plans.planId, DbConfigSource.PLATFORM_DEFAULTS_PLAN))
        .limit(1);

      return (row?.settings ?? {}) as Record<string, ConfigValue>;
    });
  }

  async planOf(tenantId: string): Promise<PlanDefinition | undefined> {
    return withTransaction(this.pool, async (client) => {
      const database = drizzle(client);

      const [tenant] = await database
        .select({ planId: tenants.planId })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      // sem tenant ou com plan_id NULL: não há plano a resolver
      if (tenant === undefined || tenant.planId === null) return undefined;

      const [plan] = await database.select().from(plans).where(eq(plans.planId, tenant.planId)).limit(1);
      if (plan === undefined) return undefined;

      return {
        planId: plan.planId,
        name: plan.name,
        entitlements: plan.entitlements as Entitlements,
        settings: plan.settings as Record<string, ConfigValue>,
      };
    });
  }

  async tenantOverrides(tenantId: string): Promise<Record<string, ConfigValue>> {
    const rows = await withTenantTx(
      this.pool,
      (client) => drizzle(client).select().from(tenantSettings),
      tenantId,
    );

    return Object.fromEntries(rows.map((row) => [row.key, row.value as ConfigValue]));
  }
}
