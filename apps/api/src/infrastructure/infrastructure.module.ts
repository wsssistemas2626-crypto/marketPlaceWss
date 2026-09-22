import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';

import { DATABASE_POOL, REDIS_CLIENT, createPool } from '@mkt/platform';

import { loadApiEnv } from '../env.js';

/**
 * Clientes de infraestrutura do processo `api`.
 *
 * O pool conecta com o role `app` (`DATABASE_URL`) — nunca com `postgres`,
 * que é superusuário e ignoraria a RLS (ADR-012 / ADR-014, armadilha #1).
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => createPool(loadApiEnv().databaseUrl, { applicationName: 'marketplace-api' }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis(loadApiEnv().redisUrl, {
          // dual stack: exigido pela rede privada da Railway (armadilha #3)
          family: 0,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        }),
    },
  ],
  exports: [DATABASE_POOL, REDIS_CLIENT],
})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Fecha pool e conexão no SIGTERM da Railway (armadilha #5). */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
