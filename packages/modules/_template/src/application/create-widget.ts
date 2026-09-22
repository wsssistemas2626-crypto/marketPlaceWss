import {
  type Clock,
  ConflictError,
  createDomainEvent,
  Money,
  type Result,
  err,
  ok,
} from '@mkt/shared-kernel';

import { Widget } from '../domain/widget.js';
import type { EventPublisherPort, TransactionPort } from './ports.js';
import type { WidgetRepositoryPort } from './widget-repository.port.js';

export interface CreateWidgetCommand {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly priceCents: number;
  readonly correlationId?: string;
}

/**
 * Caso de uso de exemplo: valida, cria o agregado, persiste e publica o evento.
 *
 * O `transaction.run` garante o que o CLAUDE.md §4.5 exige: a linha do widget e
 * a linha do outbox entram juntas ou não entram. Se o COMMIT falhar, ninguém
 * recebe um evento sobre um widget que não existe.
 */
export class CreateWidget {
  constructor(
    private readonly repository: WidgetRepositoryPort,
    private readonly transaction: TransactionPort,
    private readonly events: EventPublisherPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateWidgetCommand): Promise<Result<Widget>> {
    return this.transaction.run(async () => {
      const existing = await this.repository.findBySlug(command.slug);
      if (existing !== undefined) {
        return err(
          new ConflictError(`Já existe um widget com o slug "${command.slug}"`, {
            slug: command.slug,
          }),
        );
      }

      const widget = Widget.create(
        {
          tenantId: command.tenantId,
          slug: command.slug,
          name: command.name,
          price: Money.fromCents(command.priceCents),
        },
        this.clock,
      );

      await this.repository.save(widget);
      await this.events.publish(
        createDomainEvent(
          {
            type: 'template.widget.created',
            source: 'mkt/template',
            tenantId: widget.tenantId,
            subject: `widget/${widget.id}`,
            data: {
              widgetId: widget.id,
              slug: widget.slug,
              name: widget.name,
              priceCents: widget.price.cents,
            },
            ...(command.correlationId === undefined ? {} : { correlationId: command.correlationId }),
          },
          this.clock,
        ),
      );

      return ok(widget);
    });
  }
}
