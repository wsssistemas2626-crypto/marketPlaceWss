import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Worker } from 'bullmq';

import { parseEvent, type CloudEvent } from '@mkt/contracts';
import {
  consumeOnce,
  createEventWorker,
  DATABASE_POOL,
  EVENT_BUS,
  type DatabasePool,
  type EventBusPort,
} from '@mkt/platform';
import { WidgetCreatedHandler } from '@mkt/modules-template';

/**
 * Consome a fila de eventos.
 *
 * Cada handler roda dentro de `consumeOnce`, que (1) restaura o TenantContext
 * a partir do `tenantid` do envelope e (2) grava a chave de idempotência na
 * mesma transação do efeito — entrega at-least-once vira efeito exactly-once
 * (CLAUDE.md §4.5).
 *
 * Evento fora do catálogo ou sem tenant vai direto para a DLQ: não adianta
 * tentar de novo um envelope que nunca vai ficar válido (US-072).
 */
@Injectable()
export class EventConsumerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventConsumerService.name);
  private worker: Worker | undefined;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    @Inject(EVENT_BUS) private readonly bus: EventBusPort,
    private readonly widgetCreated: WidgetCreatedHandler,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = createEventWorker((event) => this.dispatch(event), this.bus, {
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379', family: 0 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  /** Roteia o evento para os handlers interessados. */
  async dispatch(raw: unknown): Promise<void> {
    let event: CloudEvent;
    try {
      event = parseEvent(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`envelope inválido, indo para a DLQ: ${reason}`);
      await this.bus.publishToDeadLetter(raw, reason);
      return;
    }

    if (event.type === 'template.widget.created') {
      const result = await consumeOnce(this.pool, event, WidgetCreatedHandler.handlerName, (consumed) =>
        this.widgetCreated.handle(consumed),
      );

      if (result.duplicate) {
        this.logger.debug(`evento ${event.id} já processado por ${WidgetCreatedHandler.handlerName}`);
      }
    }
  }
}
