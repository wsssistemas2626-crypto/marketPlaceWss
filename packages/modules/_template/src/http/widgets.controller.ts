import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Idempotent, Public, requireTenant } from '@mkt/platform';
import { unwrap, ValidationError } from '@mkt/shared-kernel';

import { CreateWidget } from '../application/create-widget.js';
import { ListWidgets } from '../application/list-widgets.js';
import type { Widget } from '../domain/widget.js';
import { createWidgetSchema, type WidgetResponse } from './widget.dto.js';

const toResponse = (widget: Widget): WidgetResponse => {
  const snapshot = widget.toSnapshot();
  return {
    id: snapshot.id,
    slug: snapshot.slug,
    name: snapshot.name,
    priceCents: snapshot.price.cents,
    createdAt: snapshot.createdAt.toISOString(),
  };
};

/** Rotas de exemplo do módulo `_template` (público: comprador). */
@Controller('store/widgets')
@Public('módulo de exemplo (_template): exercita o tenant resolvido pelo host')
export class WidgetsController {
  constructor(
    private readonly createWidget: CreateWidget,
    private readonly listWidgets: ListWidgets,
  ) {}

  @Get()
  async list(@Query('limit') limit?: string): Promise<{ data: WidgetResponse[] }> {
    const parsed = limit === undefined ? 20 : Number(limit);
    const widgets = await this.listWidgets.execute(Number.isNaN(parsed) ? 20 : parsed);
    return { data: widgets.map(toResponse) };
  }

  // cria recurso: exige Idempotency-Key (CLAUDE.md §4.10)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown): Promise<WidgetResponse> {
    const parsed = createWidgetSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(issue?.message ?? 'Corpo inválido', {
        field: issue?.path.join('.') ?? 'body',
      });
    }

    // o tenant vem do contexto resolvido na borda, nunca do corpo
    const result = await this.createWidget.execute({
      tenantId: requireTenant().tenantId,
      ...parsed.data,
    });

    return toResponse(unwrap(result));
  }
}
