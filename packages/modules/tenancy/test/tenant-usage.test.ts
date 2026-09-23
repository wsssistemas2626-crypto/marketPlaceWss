import { describe, expect, it } from 'vitest';

import {
  EMPTY_USAGE,
  TenantUsageProjection,
  USAGE_METRICS,
  type TenantUsage,
  type UsageMetric,
  type UsageProjectionPort,
} from '../src/application/tenant-usage.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

class ProjecaoEmMemoria implements UsageProjectionPort {
  readonly valores = new Map<string, number>();

  async increment(tenantId: string, metric: UsageMetric, delta: number): Promise<void> {
    const chave = `${tenantId}:${metric}`;
    this.valores.set(chave, (this.valores.get(chave) ?? 0) + delta);
  }

  async get(tenantId: string): Promise<TenantUsage> {
    return USAGE_METRICS.reduce<TenantUsage>(
      (total, metric) => ({ ...total, [metric]: this.valores.get(`${tenantId}:${metric}`) ?? 0 }),
      { ...EMPTY_USAGE },
    );
  }
}

const evento = (type: string, data: unknown = {}, tenantid = TENANT_A) => ({ type, tenantid, data });

describe('projeção de uso do console (US-081 / RF-TEN-11)', () => {
  it('conta SKUs a partir dos eventos de catálogo', async () => {
    const projecao = new ProjecaoEmMemoria();
    const uso = new TenantUsageProjection(projecao);

    await uso.apply(evento('catalog.product.published'));
    await uso.apply(evento('catalog.product.published'));
    await uso.apply(evento('catalog.product.unpublished'));

    expect((await uso.get(TENANT_A)).skus).toBe(1);
  });

  it('soma GMV com o valor do pedido pago', async () => {
    const uso = new TenantUsageProjection(new ProjecaoEmMemoria());

    await uso.apply(evento('orders.order.placed'));
    await uso.apply(evento('orders.seller_order.paid', { totalCents: 15_000 }));
    await uso.apply(evento('orders.seller_order.paid', { totalCents: 5_000 }));

    const total = await uso.get(TENANT_A);
    expect(total.orders).toBe(1);
    expect(total.gmv_cents).toBe(20_000);
  });

  it('evento pago sem total não move o GMV', async () => {
    const uso = new TenantUsageProjection(new ProjecaoEmMemoria());

    const aplicou = await uso.apply(evento('orders.seller_order.paid', {}));

    expect(aplicou).toBe(false);
    expect((await uso.get(TENANT_A)).gmv_cents).toBe(0);
  });

  it('ignora evento que não move contador', async () => {
    const uso = new TenantUsageProjection(new ProjecaoEmMemoria());

    expect(await uso.apply(evento('tenancy.tenant.provisioned'))).toBe(false);
    expect(await uso.get(TENANT_A)).toEqual(EMPTY_USAGE);
  });

  it('o uso de um tenant não conta no outro', async () => {
    const uso = new TenantUsageProjection(new ProjecaoEmMemoria());

    await uso.apply(evento('catalog.product.published', {}, TENANT_A));
    await uso.apply(evento('catalog.product.published', {}, TENANT_B));
    await uso.apply(evento('catalog.product.published', {}, TENANT_B));

    expect((await uso.get(TENANT_A)).skus).toBe(1);
    expect((await uso.get(TENANT_B)).skus).toBe(2);
  });

  it('tenant sem nenhum evento tem todos os contadores zerados', async () => {
    const uso = new TenantUsageProjection(new ProjecaoEmMemoria());

    expect(await uso.get(TENANT_A)).toEqual({ orders: 0, gmv_cents: 0, skus: 0, sellers: 0 });
  });

  it('declara quais eventos o consumidor precisa rotear', () => {
    const observados = TenantUsageProjection.observedEventTypes;

    expect(observados).toContain('orders.order.placed');
    expect(observados).toContain('sellers.seller.approved');
    // o módulo de exemplo faz as vezes do catálogo até ele existir
    expect(observados).toContain('template.widget.created');
  });
});
