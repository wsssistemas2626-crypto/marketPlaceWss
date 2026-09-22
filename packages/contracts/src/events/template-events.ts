import { z } from 'zod';

import { registerEvent } from './catalog.js';

/**
 * Evento do módulo de exemplo. Existe para o `_template` provar o fluxo
 * outbox → relay → consumidor idempotente ponta a ponta.
 */
export const widgetCreatedData = z.object({
  widgetId: z.string(),
  slug: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
});

export type WidgetCreatedData = z.infer<typeof widgetCreatedData>;

export const WIDGET_CREATED = registerEvent({
  type: 'template.widget.created',
  version: 1,
  schema: widgetCreatedData,
  isPublic: false,
  description: 'Um widget de exemplo foi criado.',
});
