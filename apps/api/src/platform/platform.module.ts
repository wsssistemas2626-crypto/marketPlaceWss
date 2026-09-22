import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { Redis } from 'ioredis';

import {
  CorrelationIdMiddleware,
  IDEMPOTENCY_STORE,
  IdempotencyInterceptor,
  ProblemDetailsFilter,
  RATE_LIMIT_STORE,
  RateLimitGuard,
  RedisIdempotencyStore,
  REDIS_CLIENT,
} from '@mkt/platform';

/**
 * Comportamentos transversais da API (US-006 e US-007):
 * correlation id, Problem Details, idempotência e rate limit.
 *
 * Idempotência e rate limit usam o Redis com chaves prefixadas por tenant
 * (`t:{tenantId}:…`), então a cota e o replay de um tenant nunca alcançam o
 * outro (`06-multi-tenancy.md` §4).
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    {
      provide: IDEMPOTENCY_STORE,
      useFactory: (redis: Redis) => new RedisIdempotencyStore(redis),
      inject: [REDIS_CLIENT],
    },
    { provide: RATE_LIMIT_STORE, useExisting: REDIS_CLIENT },
  ],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
