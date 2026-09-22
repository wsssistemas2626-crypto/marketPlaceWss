import { z } from 'zod';

/**
 * DTO público da rota. Na Fase 1 estes schemas migram para
 * `packages/contracts` e alimentam o OpenAPI e o SDK.
 *
 * Repare que **não existe** campo `tenantId`: aceitar tenant do cliente é
 * exatamente o que o CLAUDE.md §4.11 proíbe.
 */
export const createWidgetSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug deve ser minúsculo, com hífens'),
  name: z.string().min(1).max(120),
  priceCents: z.number().int().nonnegative(),
});

export type CreateWidgetDto = z.infer<typeof createWidgetSchema>;

export interface WidgetResponse {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly priceCents: number;
  readonly createdAt: string;
}
