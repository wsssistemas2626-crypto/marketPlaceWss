import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { Redis } from 'ioredis';

import {
  CONFIG_SOURCE,
  ConfigService,
  CorrelationIdMiddleware,
  DEVELOPMENT_PLANS,
  DEVELOPMENT_TENANTS,
  IDEMPOTENCY_STORE,
  IdempotencyInterceptor,
  InMemoryConfigSource,
  ProblemDetailsFilter,
  RATE_LIMIT_STORE,
  RateLimitGuard,
  RedisIdempotencyStore,
  REDIS_CLIENT,
  RequiresModuleGuard,
} from '@mkt/platform';

/**
 * Comportamentos transversais da API (US-006, US-007 e US-073):
 * correlation id, Problem Details, idempotência, rate limit e configuração
 * hierárquica com entitlements de plano.
 *
 * Idempotência e rate limit usam o Redis com chaves prefixadas por tenant
 * (`t:{tenantId}:…`), então a cota e o replay de um tenant nunca alcançam o
 * outro (`06-multi-tenancy.md` §4).
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: RequiresModuleGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    {
      provide: IDEMPOTENCY_STORE,
      useFactory: (redis: Redis) => new RedisIdempotencyStore(redis),
      inject: [REDIS_CLIENT],
    },
    { provide: RATE_LIMIT_STORE, useExisting: REDIS_CLIENT },
    {
      // fonte em memória até a US-075 trazer planos e configurações no banco
      provide: CONFIG_SOURCE,
      useFactory: () => {
        const source = new InMemoryConfigSource({ 'orders.cancel_window_minutes': 15 });
        DEVELOPMENT_TENANTS.forEach((tenant, indice) => {
          const plano = DEVELOPMENT_PLANS[indice % DEVELOPMENT_PLANS.length];
          if (plano !== undefined) source.assignPlan(tenant.tenantId, plano);
        });
        return source;
      },
    },
    ConfigService,
  ],
  exports: [ConfigService],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
