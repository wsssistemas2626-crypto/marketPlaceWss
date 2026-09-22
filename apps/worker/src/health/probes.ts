import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type pg from 'pg';

import type { HealthProbe } from '@mkt/platform';

import { DATABASE_POOL, REDIS_CLIENT } from '@mkt/platform';

@Injectable()
export class PostgresProbe implements HealthProbe {
  readonly name = 'database';

  constructor(@Inject(DATABASE_POOL) private readonly pool: pg.Pool) {}

  async check(): Promise<void> {
    await this.pool.query('select 1');
  }
}

@Injectable()
export class RedisProbe implements HealthProbe {
  readonly name = 'redis';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(): Promise<void> {
    await this.redis.ping();
  }
}
