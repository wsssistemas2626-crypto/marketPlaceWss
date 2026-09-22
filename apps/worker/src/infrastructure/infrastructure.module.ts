import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';

import { DATABASE_POOL, REDIS_CLIENT, createPool } from '@mkt/platform';

import { loadWorkerEnv } from '../env.js';

/** Mesmos clientes da api; o worker ganha filas BullMQ na US-005. */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => createPool(loadWorkerEnv().databaseUrl, { applicationName: 'marketplace-worker' }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis(loadWorkerEnv().redisUrl, {
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

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
