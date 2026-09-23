/**
 * ÚNICA API pública do módulo (CLAUDE.md §4.1). Outros módulos importam
 * `@mkt/modules-template` — nunca um arquivo interno.
 */
export { CreateWidget, type CreateWidgetCommand } from './application/create-widget.js';
export { ListWidgets } from './application/list-widgets.js';
export {
  EVENT_PUBLISHER,
  TRANSACTION,
  type EventPublisherPort,
  type TransactionPort,
} from './application/ports.js';
export { TenantCreatedHandler } from './events/tenant-created.handler.js';
export { WidgetCreatedHandler } from './events/widget-created.handler.js';
export { WIDGET_REPOSITORY, type WidgetRepositoryPort } from './application/widget-repository.port.js';
export { Widget, type WidgetSnapshot } from './domain/widget.js';
export { TemplateModule } from './template.module.js';
