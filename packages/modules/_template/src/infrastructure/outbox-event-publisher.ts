import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_POOL, enqueueOutboxEvent, useTenantClient, type DatabasePool } from '@mkt/platform';
import type { DomainEvent } from '@mkt/shared-kernel';

import type { EventPublisherPort } from '../application/ports.js';

/** Grava o evento na `template.outbox` usando a transação em andamento. */
@Injectable()
export class OutboxEventPublisher implements EventPublisherPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async publish(event: DomainEvent): Promise<void> {
    await useTenantClient(this.pool, (client) => enqueueOutboxEvent(client, 'template', event));
  }
}
