import type { ConfigSourcePort, ConfigValue, PlanDefinition } from './config.types.js';

/** Fonte em memória para desenvolvimento e testes (US-075 traz a de banco). */
export class InMemoryConfigSource implements ConfigSourcePort {
  private readonly plansByTenant = new Map<string, PlanDefinition>();
  private readonly overridesByTenant = new Map<string, Record<string, ConfigValue>>();

  constructor(private defaults: Record<string, ConfigValue> = {}) {}

  async platformDefaults(): Promise<Record<string, ConfigValue>> {
    return this.defaults;
  }

  async planOf(tenantId: string): Promise<PlanDefinition | undefined> {
    return this.plansByTenant.get(tenantId);
  }

  async tenantOverrides(tenantId: string): Promise<Record<string, ConfigValue>> {
    return this.overridesByTenant.get(tenantId) ?? {};
  }

  setPlatformDefaults(defaults: Record<string, ConfigValue>): void {
    this.defaults = defaults;
  }

  assignPlan(tenantId: string, plan: PlanDefinition): void {
    this.plansByTenant.set(tenantId, plan);
  }

  setTenantOverrides(tenantId: string, overrides: Record<string, ConfigValue>): void {
    this.overridesByTenant.set(tenantId, overrides);
  }
}

/** Planos de desenvolvimento, suficientes para exercitar entitlements. */
export const DEVELOPMENT_PLANS: readonly PlanDefinition[] = [
  {
    planId: 'starter',
    name: 'Starter',
    entitlements: {
      modules: ['catalog', 'offers', 'orders', 'payments', 'shipping', 'notifications'],
      limits: { sellers: 10, skus: 1_000, staffUsers: 3, customDomains: 0 },
    },
    settings: { 'orders.cancel_window_minutes': 30 },
  },
  {
    planId: 'growth',
    name: 'Growth',
    entitlements: {
      modules: [
        'catalog',
        'offers',
        'orders',
        'payments',
        'shipping',
        'notifications',
        'reviews',
        'disputes',
        'promotions',
        'public_api',
      ],
      limits: { sellers: 200, skus: 100_000, staffUsers: 10, customDomains: 2 },
    },
    settings: { 'orders.cancel_window_minutes': 60 },
  },
];
