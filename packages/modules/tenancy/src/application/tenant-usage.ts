/**
 * Métricas que o console mostra por tenant (RF-TEN-11).
 *
 * A lista é fechada de propósito: métrica nova entra aqui junto do evento que
 * a alimenta, e não por string solta espalhada pelos módulos.
 */
export const USAGE_METRICS = ['orders', 'gmv_cents', 'skus', 'sellers'] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

export type TenantUsage = Record<UsageMetric, number>;

export const EMPTY_USAGE: TenantUsage = { orders: 0, gmv_cents: 0, skus: 0, sellers: 0 };

export interface UsageProjectionPort {
  increment(tenantId: string, metric: UsageMetric, delta: number): Promise<void>;
  get(tenantId: string): Promise<TenantUsage>;
}

export const USAGE_PROJECTION = Symbol('USAGE_PROJECTION');

/**
 * Mapeia evento → métrica. É o contrato entre os módulos e o console:
 * quem publica o evento não sabe que existe um contador do outro lado.
 */
const METRIC_BY_EVENT: Record<string, { metric: UsageMetric; delta: (data: unknown) => number }> = {
  // catálogo ainda não existe; o módulo de exemplo faz as vezes dele na Fase 0/1
  'template.widget.created': { metric: 'skus', delta: () => 1 },
  'catalog.product.published': { metric: 'skus', delta: () => 1 },
  'catalog.product.unpublished': { metric: 'skus', delta: () => -1 },
  'sellers.seller.approved': { metric: 'sellers', delta: () => 1 },
  'sellers.seller.suspended': { metric: 'sellers', delta: () => -1 },
  'orders.order.placed': { metric: 'orders', delta: () => 1 },
  'orders.seller_order.paid': {
    metric: 'gmv_cents',
    // GMV soma o valor pago; evento sem total não move o número
    delta: (data) => {
      const payload = data as { totalCents?: unknown };
      return typeof payload.totalCents === 'number' ? payload.totalCents : 0;
    },
  },
};

export class TenantUsageProjection {
  constructor(private readonly projection: UsageProjectionPort) {}

  /** Aplica um evento à projeção. Evento sem métrica associada é ignorado. */
  async apply(event: { type: string; tenantid: string; data: unknown }): Promise<boolean> {
    const regra = METRIC_BY_EVENT[event.type];
    if (regra === undefined) return false;

    const delta = regra.delta(event.data);
    if (delta === 0) return false;

    await this.projection.increment(event.tenantid, regra.metric, delta);
    return true;
  }

  async get(tenantId: string): Promise<TenantUsage> {
    return this.projection.get(tenantId);
  }

  /** Tipos de evento que movem algum contador — usado pelo consumidor. */
  static get observedEventTypes(): string[] {
    return Object.keys(METRIC_BY_EVENT);
  }
}
