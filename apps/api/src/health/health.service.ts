import { Injectable } from '@nestjs/common';

import { runHealthChecks, type HealthReport } from '@mkt/platform';

import { PostgresProbe, RedisProbe } from './probes.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly postgres: PostgresProbe,
    private readonly redis: RedisProbe,
  ) {}

  /** Só dependências próprias: nada de Clerk/gateway aqui (armadilha #8). */
  async check(): Promise<HealthReport> {
    return runHealthChecks([this.postgres, this.redis], { timeoutMs: 2_000 });
  }
}
