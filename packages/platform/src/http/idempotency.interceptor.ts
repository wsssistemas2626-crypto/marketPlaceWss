import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, type Observable } from 'rxjs';

import { requireTenant } from '../tenancy/tenant-context.js';
import {
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeyMissingError,
  runIdempotent,
  type IdempotencyStore,
} from './idempotency.js';

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');
const IDEMPOTENT_KEY = 'mkt:idempotent';

/**
 * Marca a rota como obrigatoriamente idempotente — endpoints que criam
 * recursos ou movimentam dinheiro (CLAUDE.md §4.10).
 */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT_KEY, true);

interface IdempotentRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required !== true) return next.handle();

    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const raw = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(raw) ? raw[0] : raw;

    if (key === undefined || key.trim() === '') {
      throw new IdempotencyKeyMissingError();
    }

    const execution = runIdempotent(
      this.store,
      {
        tenantId: requireTenant().tenantId,
        key,
        method: request.method,
        path: request.url,
        body: request.body,
      },
      async () => {
        const body = await lastValueOf(next.handle());
        return { statusCode: 200, body };
      },
    ).then((result) => result.body);

    return from(execution);
  }
}

/** Observable → Promise sem puxar `rxjs/operators` no bundle do pacote. */
function lastValueOf<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let last: T;
    let received = false;
    source.subscribe({
      next: (value) => {
        last = value;
        received = true;
      },
      error: reject,
      complete: () => (received ? resolve(last) : reject(new Error('handler não emitiu resposta'))),
    });
  });
}
