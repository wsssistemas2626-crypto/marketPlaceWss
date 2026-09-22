import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';

import { loadWorkerEnv } from '../env.js';

export const POSTGRES_POOL = Symbol('POSTGRES_POOL');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Mesmos clientes da api; o worker ganha filas BullMQ na US-005. */
@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      useFactory: () =>
        new pg.Pool({
          connectionString: loadWorkerEnv().databaseUrl,
          max: 10,
          connectionTimeoutMillis: 5_000,
        }),
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
  exports: [POSTGRES_POOL, REDIS_CLIENT],
})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
