import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';

import type { CloudEvent } from '@mkt/contracts';

import type { EventBusPort } from './event-bus.port.js';

export const EVENTS_QUEUE = 'events';
export const EVENTS_DLQ = 'events-dlq';

/** Tentativas antes de considerar o evento morto (US-005: 5 falhas → DLQ). */
export const MAX_DELIVERY_ATTEMPTS = 5;

export interface EventBusOptions {
  readonly connection: ConnectionOptions;
  readonly attempts?: number;
  readonly backoffMs?: number;
}

/** Chave de fila por tenant: nada é compartilhado entre tenants (US-072). */
export const tenantJobId = (event: CloudEvent): string => `t:${event.tenantid}:${event.id}`;

/**
 * Barramento em BullMQ.
 *
 * `jobId` derivado do id do evento dá uma segunda camada de deduplicação
 * (a primeira é o `processed_events` do consumidor).
 */
export class BullMqEventBus implements EventBusPort {
  private readonly queue: Queue;
  private readonly deadLetterQueue: Queue;

  constructor(private readonly options: EventBusOptions) {
    this.queue = new Queue(EVENTS_QUEUE, { connection: options.connection });
    this.deadLetterQueue = new Queue(EVENTS_DLQ, { connection: options.connection });
  }

  async publish(event: CloudEvent): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: tenantJobId(event),
      attempts: this.options.attempts ?? MAX_DELIVERY_ATTEMPTS,
      backoff: { type: 'exponential', delay: this.options.backoffMs ?? 1_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: false,
    });
  }

  async publishToDeadLetter(event: unknown, reason: string): Promise<void> {
    await this.deadLetterQueue.add('dead-letter', { event, reason, failedAt: new Date().toISOString() });
  }

  async close(): Promise<void> {
    await Promise.all([this.queue.close(), this.deadLetterQueue.close()]);
  }
}

export interface EventWorkerOptions extends EventBusOptions {
  /** Jobs simultâneos. A justiça entre tenants é tratada na US-072. */
  readonly concurrency?: number;
}

/**
 * Worker da fila de eventos. Quando um job esgota as tentativas, ele vai para
 * a DLQ — nenhum evento some silenciosamente.
 */
export function createEventWorker(
  handle: (event: CloudEvent) => Promise<void>,
  bus: EventBusPort,
  options: EventWorkerOptions,
): Worker {
  const attempts = options.attempts ?? MAX_DELIVERY_ATTEMPTS;

  const worker = new Worker(
    EVENTS_QUEUE,
    async (job: Job) => {
      await handle(job.data as CloudEvent);
    },
    {
      connection: options.connection,
      concurrency: options.concurrency ?? 8,
    },
  );

  worker.on('failed', (job, error) => {
    if (job !== undefined && job.attemptsMade >= attempts) {
      void bus.publishToDeadLetter(job.data, error.message);
    }
  });

  return worker;
}
