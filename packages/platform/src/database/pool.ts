import pg from 'pg';

export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export interface PoolOptions {
  /** Conexões simultâneas. A api usa poucas por réplica; o migrator, uma. */
  readonly max?: number;
  readonly connectionTimeoutMillis?: number;
  readonly applicationName?: string;
}

/**
 * Cria um pool do Postgres.
 *
 * A URL determina o role e, com ele, o que o processo pode fazer (ADR-014 §3):
 * `app` no runtime (sem BYPASSRLS), `platform` só no outbox relay e em
 * `@PlatformJob`, `migrator` só nas migrações. **Nunca** o usuário `postgres`.
 */
export function createPool(connectionString: string, options: PoolOptions = {}): DatabasePool {
  return new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'marketplace',
  });
}
