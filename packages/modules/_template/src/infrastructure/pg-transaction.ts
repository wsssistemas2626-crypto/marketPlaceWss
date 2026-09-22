import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_POOL, useTenantClient, type DatabasePool } from '@mkt/platform';

import type { TransactionPort } from '../application/ports.js';

/** Unidade de trabalho sobre `withTenantTx` (abre uma só se ainda não houver). */
@Injectable()
export class PgTransaction implements TransactionPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    return useTenantClient(this.pool, () => work());
  }
}
