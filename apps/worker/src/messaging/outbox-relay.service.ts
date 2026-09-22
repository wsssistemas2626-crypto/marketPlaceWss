import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import {
  DATABASE_POOL_PLATFORM,
  EVENT_BUS,
  relayOutboxBatch,
  type DatabasePool,
  type EventBusPort,
} from '@mkt/platform';

/** Schemas de módulo que têm tabela `outbox`. Cresce a cada módulo novo. */
const OUTBOX_SCHEMAS = ['template'];

/**
 * Relay do outbox: o único lugar (com `@PlatformJob`) que usa o role
 * `platform` com BYPASSRLS, porque precisa varrer eventos de todos os tenants
 * (CLAUDE.md §9). Ele não abre TenantContext — o consumidor é que restaura o
 * contexto a partir do `tenantid` do envelope.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(DATABASE_POOL_PLATFORM) private readonly pool: DatabasePool,
    @Inject(EVENT_BUS) private readonly bus: EventBusPort,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /** Publica um lote. Exposto para o teste de integração chamar direto. */
  async tick(): Promise<void> {
    if (this.running) return; // nunca dois lotes ao mesmo tempo no mesmo processo
    this.running = true;
    try {
      const result = await relayOutboxBatch(this.pool, this.bus, { schemas: OUTBOX_SCHEMAS });
      if (result.published > 0 || result.deadLettered > 0) {
        this.logger.log(
          `outbox: ${result.published} publicados, ${result.deadLettered} para DLQ, ${result.failed} para nova tentativa`,
        );
      }
    } catch (error) {
      this.logger.error(`falha no relay do outbox: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.running = false;
    }
  }
}
