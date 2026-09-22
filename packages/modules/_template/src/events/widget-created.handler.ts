import { Injectable, Logger } from '@nestjs/common';

import { requireTenant } from '@mkt/platform';
import { widgetCreatedData, type CloudEvent } from '@mkt/contracts';

/**
 * Consumidor de exemplo: reage ao próprio evento do módulo para provar o
 * caminho completo (outbox → relay → fila → handler) com o TenantContext
 * restaurado a partir do envelope.
 *
 * Na Fase 1, handlers assim mantêm projeções locais de outros módulos — é o
 * que substitui JOIN entre schemas (CLAUDE.md §4.2).
 */
@Injectable()
export class WidgetCreatedHandler {
  static readonly handlerName = 'template.widget-created.log';
  private readonly logger = new Logger(WidgetCreatedHandler.name);
  readonly handled: string[] = [];

  async handle(event: CloudEvent): Promise<void> {
    const data = widgetCreatedData.parse(event.data);
    // o contexto já está aberto pelo consumeOnce: se não estivesse, isto lançaria
    const tenant = requireTenant();

    this.handled.push(data.widgetId);
    this.logger.log(`widget ${data.slug} criado no tenant ${tenant.tenantId}`);
  }
}
