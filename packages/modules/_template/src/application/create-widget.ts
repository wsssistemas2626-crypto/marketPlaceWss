import { type Clock, ConflictError, Money, type Result, err, ok } from '@mkt/shared-kernel';

import { Widget } from '../domain/widget.js';
import type { WidgetRepositoryPort } from './widget-repository.port.js';

export interface CreateWidgetCommand {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly priceCents: number;
}

/**
 * Caso de uso de exemplo: valida, cria o agregado e persiste.
 * A publicação do evento pelo outbox entra na US-005.
 */
export class CreateWidget {
  constructor(
    private readonly repository: WidgetRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateWidgetCommand): Promise<Result<Widget>> {
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
    return ok(widget);
  }
}
