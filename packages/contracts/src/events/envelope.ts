import { z } from 'zod';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** `<modulo>.<entidade>.<verbo_no_passado>` — CLAUDE.md §5. */
export const eventTypeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'tipo deve ser <modulo>.<entidade>.<verbo>');

/**
 * Envelope CloudEvents 1.0 usado no outbox, na fila e nos webhooks
 * (`docs/arquitetura/03-integracoes.md` §2).
 *
 * `tenantid` é obrigatório: é com ele que o consumidor restaura o
 * TenantContext. Evento sem tenant vai para a DLQ (ADR-012 / US-072).
 */
export const cloudEventSchema = z.object({
  specversion: z.literal('1.0'),
  id: z.string().regex(UUID_V7, 'id do evento deve ser UUID v7'),
  source: z.string().min(1),
  type: eventTypeSchema,
  dataschemaversion: z.number().int().positive(),
  time: z.iso.datetime(),
  subject: z.string().min(1),
  tenantid: z.string().regex(UUID_V7, 'tenantid deve ser UUID v7'),
  sellerid: z.string().optional(),
  correlationid: z.string().optional(),
  data: z.unknown(),
});

export type CloudEvent<TData = unknown> = Omit<z.infer<typeof cloudEventSchema>, 'data'> & {
  data: TData;
};

/** Valida o envelope (sem olhar o `data`, que depende do tipo). */
export function parseEnvelope(value: unknown): CloudEvent {
  return cloudEventSchema.parse(value) as CloudEvent;
}
