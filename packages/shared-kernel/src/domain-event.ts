import type { Clock } from './clock.js';
import { ValidationError } from './errors.js';
import { Id } from './id.js';

/**
 * Evento de domínio, já no formato do envelope CloudEvents 1.0 usado no outbox
 * e nos webhooks (`docs/arquitetura/03-integracoes.md` §2).
 *
 * `tenantId` é **obrigatório**: o consumidor restaura o TenantContext a partir
 * dele (ADR-012). Evento sem tenant vai para a DLQ (US-072).
 */
export interface DomainEvent<TData = unknown> {
  /** UUID v7 — também é a chave de idempotência do consumidor (CLAUDE.md §4.5). */
  readonly id: string;
  /** `<modulo>.<entidade>.<verbo_no_passado>` — ex.: `orders.order.placed`. */
  readonly type: string;
  /** Módulo que publicou, no formato `mkt/<modulo>`. */
  readonly source: string;
  /** Versão do schema do `data` em `packages/contracts`. */
  readonly dataSchemaVersion: number;
  readonly time: Date;
  readonly tenantId: string;
  /** `<entidade>/<id>` do agregado afetado. */
  readonly subject: string;
  readonly sellerId?: string;
  readonly correlationId?: string;
  readonly data: TData;
}

export interface CreateDomainEventInput<TData> {
  readonly type: string;
  readonly source: string;
  readonly tenantId: string;
  readonly subject: string;
  readonly data: TData;
  readonly dataSchemaVersion?: number;
  readonly sellerId?: string;
  readonly correlationId?: string;
}

const TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Monta o evento com id v7 e horário do `Clock` (nunca `Date.now()`). */
export function createDomainEvent<TData>(
  input: CreateDomainEventInput<TData>,
  clock: Clock,
): DomainEvent<TData> {
  if (!TYPE_PATTERN.test(input.type)) {
    throw new ValidationError(
      `Tipo de evento deve ser <modulo>.<entidade>.<verbo_no_passado>, recebeu "${input.type}"`,
      { field: 'type' },
    );
  }
  Id.parse(input.tenantId, 'tenantId');

  return {
    id: Id.create(clock),
    type: input.type,
    source: input.source,
    dataSchemaVersion: input.dataSchemaVersion ?? 1,
    time: clock.now(),
    tenantId: input.tenantId,
    subject: input.subject,
    ...(input.sellerId === undefined ? {} : { sellerId: input.sellerId }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    data: input.data,
  };
}
