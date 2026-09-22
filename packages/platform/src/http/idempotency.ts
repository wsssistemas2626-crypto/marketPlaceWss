import { createHash } from 'node:crypto';

import { DomainError } from '@mkt/shared-kernel';

import { tenantCacheKeyFor } from '../tenancy/tenant-keys.js';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** 24 h: janela recomendada para retry de cliente e de gateway. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export class IdempotencyKeyMissingError extends DomainError {
  constructor() {
    super(
      'idempotency_key_required',
      `O header ${IDEMPOTENCY_KEY_HEADER} é obrigatório em operações que criam recursos ou movimentam dinheiro (CLAUDE.md §4.10).`,
    );
  }
}

export class IdempotencyKeyConflictError extends DomainError {
  constructor() {
    super(
      'idempotency_key_reused',
      'Esta Idempotency-Key já foi usada com um corpo diferente. Use uma chave nova para uma operação nova.',
    );
  }
}

export class IdempotentRequestInFlightError extends DomainError {
  constructor() {
    super('idempotent_request_in_flight', 'Uma requisição com esta Idempotency-Key ainda está em andamento.');
  }
}

/** Registro guardado enquanto a janela de idempotência está aberta. */
export interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly status: 'in_flight' | 'completed';
  readonly response?: { statusCode: number; body: unknown };
}

export interface IdempotencyStore {
  /** Grava só se ainda não existir; devolve o registro existente, se houver. */
  putIfAbsent(key: string, record: IdempotencyRecord, ttlMs: number): Promise<IdempotencyRecord | undefined>;
  set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Corpo + rota identificam a operação: mesma chave com corpo diferente é erro. */
export function fingerprintRequest(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${path} ${JSON.stringify(body ?? null)}`)
    .digest('hex');
}

export function idempotencyCacheKey(tenantId: string, key: string): string {
  return tenantCacheKeyFor(tenantId, 'idempotency', key);
}

export interface IdempotentExecution<T> {
  readonly replayed: boolean;
  readonly statusCode: number;
  readonly body: T;
}

/**
 * Executa a operação **uma vez** por `Idempotency-Key`.
 *
 * - Repetição com o mesmo corpo devolve a resposta guardada (replay), sem
 *   repetir o efeito — é o que impede cobrar duas vezes quando o cliente
 *   perde a resposta e tenta de novo.
 * - Mesma chave com corpo diferente é 409: chave é da operação, não do cliente.
 * - Falha apaga o registro, para a operação poder ser tentada de novo.
 */
export async function runIdempotent<T>(
  store: IdempotencyStore,
  input: { tenantId: string; key: string; method: string; path: string; body: unknown },
  work: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentExecution<T>> {
  const cacheKey = idempotencyCacheKey(input.tenantId, input.key);
  const fingerprint = fingerprintRequest(input.method, input.path, input.body);

  const existing = await store.putIfAbsent(
    cacheKey,
    { fingerprint, status: 'in_flight' },
    IDEMPOTENCY_TTL_MS,
  );

  if (existing !== undefined) {
    if (existing.fingerprint !== fingerprint) throw new IdempotencyKeyConflictError();
    if (existing.status === 'in_flight' || existing.response === undefined) {
      throw new IdempotentRequestInFlightError();
    }

    return {
      replayed: true,
      statusCode: existing.response.statusCode,
      body: existing.response.body as T,
    };
  }

  try {
    const result = await work();
    await store.set(
      cacheKey,
      { fingerprint, status: 'completed', response: { statusCode: result.statusCode, body: result.body } },
      IDEMPOTENCY_TTL_MS,
    );

    return { replayed: false, statusCode: result.statusCode, body: result.body };
  } catch (error) {
    await store.delete(cacheKey);
    throw error;
  }
}
