import { Module } from '@nestjs/common';

import { SystemClock } from '@mkt/shared-kernel';

import { CreateWidget } from './application/create-widget.js';
import { ListWidgets } from './application/list-widgets.js';
import { WIDGET_REPOSITORY, type WidgetRepositoryPort } from './application/widget-repository.port.js';
import { DrizzleWidgetRepository } from './infrastructure/drizzle-widget.repository.js';
import { WidgetsController } from './http/widgets.controller.js';

/**
 * Composition root do módulo de exemplo: é aqui que a porta encontra o adapter.
 * O pool do banco vem do host (token `DATABASE_POOL` de `@mkt/platform`).
 */
@Module({
  controllers: [WidgetsController],
  providers: [
    { provide: WIDGET_REPOSITORY, useClass: DrizzleWidgetRepository },
    {
      provide: CreateWidget,
      useFactory: (repository: WidgetRepositoryPort) => new CreateWidget(repository, new SystemClock()),
      inject: [WIDGET_REPOSITORY],
    },
    {
      provide: ListWidgets,
      useFactory: (repository: WidgetRepositoryPort) => new ListWidgets(repository),
      inject: [WIDGET_REPOSITORY],
    },
  ],
})
export class TemplateModule {}
