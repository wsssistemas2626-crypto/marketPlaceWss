/**
 * Justiça entre tenants na fila.
 *
 * Sem isso, um tenant que enfileira 10.000 jobs ocupa todos os workers e os
 * demais esperam — o problema clássico de "vizinho barulhento" em SaaS pool
 * (`06-multi-tenancy.md` §4). O limite por tenant reserva capacidade para
 * quem chegou depois.
 */
export interface TenantFairSchedulerOptions {
  /** Jobs simultâneos no processo. */
  readonly totalConcurrency: number;
  /** Teto por tenant. Deve ser menor que o total para sobrar espaço. */
  readonly maxPerTenant: number;
}

interface Waiter {
  readonly tenantId: string;
  readonly release: () => void;
}

export class TenantFairScheduler {
  private readonly inFlightByTenant = new Map<string, number>();
  private inFlight = 0;
  private readonly waiting: Waiter[] = [];

  constructor(private readonly options: TenantFairSchedulerOptions) {}

  /** Executa `work` respeitando o teto global e o teto do tenant. */
  async run<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    await this.acquire(tenantId);
    try {
      return await work();
    } finally {
      this.release(tenantId);
    }
  }

  private hasCapacity(tenantId: string): boolean {
    return (
      this.inFlight < this.options.totalConcurrency &&
      (this.inFlightByTenant.get(tenantId) ?? 0) < this.options.maxPerTenant
    );
  }

  private async acquire(tenantId: string): Promise<void> {
    if (this.hasCapacity(tenantId)) {
      this.take(tenantId);
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiting.push({ tenantId, release: resolve });
    });
    this.take(tenantId);
  }

  private take(tenantId: string): void {
    this.inFlight += 1;
    this.inFlightByTenant.set(tenantId, (this.inFlightByTenant.get(tenantId) ?? 0) + 1);
  }

  private release(tenantId: string): void {
    this.inFlight -= 1;
    const doTenant = (this.inFlightByTenant.get(tenantId) ?? 1) - 1;
    if (doTenant === 0) this.inFlightByTenant.delete(tenantId);
    else this.inFlightByTenant.set(tenantId, doTenant);

    // acorda o primeiro da fila que caiba agora — é aqui que outro tenant
    // "fura" a fila de quem já está no teto, em vez de esperar por ordem
    const index = this.waiting.findIndex((waiter) => this.hasCapacity(waiter.tenantId));
    if (index >= 0) {
      const [waiter] = this.waiting.splice(index, 1);
      waiter?.release();
    }
  }

  /** Quantos jobs deste tenant estão em execução agora. */
  inFlightFor(tenantId: string): number {
    return this.inFlightByTenant.get(tenantId) ?? 0;
  }
}
