import { Module } from '@nestjs/common';

import { SystemClock } from '@mkt/shared-kernel';

import { CreateWidget } from './application/create-widget.js';
import { ListWidgets } from './application/list-widgets.js';
import {
  EVENT_PUBLISHER,
  TRANSACTION,
  type EventPublisherPort,
  type TransactionPort,
} from './application/ports.js';
import { WIDGET_REPOSITORY, type WidgetRepositoryPort } from './application/widget-repository.port.js';
import { TenantCreatedHandler } from './events/tenant-created.handler.js';
import { WidgetCreatedHandler } from './events/widget-created.handler.js';
import { DrizzleWidgetRepository } from './infrastructure/drizzle-widget.repository.js';
import { OutboxEventPublisher } from './infrastructure/outbox-event-publisher.js';
import { PgTransaction } from './infrastructure/pg-transaction.js';
import { SellerWidgetsController } from './http/seller-widgets.controller.js';
import { WidgetsController } from './http/widgets.controller.js';

/**
 * Composition root do módulo de exemplo: é aqui que cada porta encontra seu
 * adapter. O pool do banco vem do host (token `DATABASE_POOL`).
 */
@Module({
  controllers: [WidgetsController, SellerWidgetsController],
  providers: [
    { provide: WIDGET_REPOSITORY, useClass: DrizzleWidgetRepository },
    { provide: TRANSACTION, useClass: PgTransaction },
    { provide: EVENT_PUBLISHER, useClass: OutboxEventPublisher },
    WidgetCreatedHandler,
    TenantCreatedHandler,
    {
      provide: CreateWidget,
      useFactory: (
        repository: WidgetRepositoryPort,
        transaction: TransactionPort,
        events: EventPublisherPort,
      ) => new CreateWidget(repository, transaction, events, new SystemClock()),
      inject: [WIDGET_REPOSITORY, TRANSACTION, EVENT_PUBLISHER],
    },
    {
      provide: ListWidgets,
      useFactory: (repository: WidgetRepositoryPort) => new ListWidgets(repository),
      inject: [WIDGET_REPOSITORY],
    },
  ],
  exports: [WidgetCreatedHandler, TenantCreatedHandler],
})
export class TemplateModule {}
