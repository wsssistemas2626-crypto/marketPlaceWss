import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable, type NestMiddleware } from '@nestjs/common';

import { Id, SystemClock } from '@mkt/shared-kernel';

const storage = new AsyncLocalStorage<string>();

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Id da requisição/job atual, se houver. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore();
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run(correlationId, fn);
}

const clock = new SystemClock();

export function newCorrelationId(): string {
  return Id.create(clock);
}

interface CorrelationCarrier {
  readonly headers: Record<string, string | string[] | undefined>;
}

interface HeaderSetter {
  setHeader?(name: string, value: string): unknown;
}

/**
 * Propaga o `correlation_id` (RNF-OBS-01).
 *
 * Aceita o id vindo do cliente/edge para encadear a requisição com o que veio
 * antes; se não vier, cria um. O mesmo id vai para o log, para o trace e para
 * o envelope dos eventos — é o fio que liga storefront → api → worker →
 * adapter externo.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: CorrelationCarrier, response: HeaderSetter, next: () => void): void {
    const received = request.headers[CORRELATION_ID_HEADER];
    const correlationId = (Array.isArray(received) ? received[0] : received) ?? newCorrelationId();

    response.setHeader?.(CORRELATION_ID_HEADER, correlationId);
    runWithCorrelationId(correlationId, next);
  }
}
