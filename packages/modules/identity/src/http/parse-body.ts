import { ValidationError } from '@mkt/shared-kernel';
import type { z } from 'zod';

/** Valida o corpo pelo schema do contrato; o primeiro problema vira erro de campo (422). */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const issue = parsed.error.issues[0];
  throw new ValidationError(issue?.message ?? 'Corpo inválido', { field: issue?.path.join('.') || 'body' });
}
