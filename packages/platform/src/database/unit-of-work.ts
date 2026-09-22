import { AsyncLocalStorage } from 'node:async_hooks';

import { requireTenant } from '../tenancy/tenant-context.js';
import type { DatabaseClient, DatabasePool } from './pool.js';

/** Transação em andamento, para que repositórios aninhados não abram outra. */
const transactionStorage = new AsyncLocalStorage<DatabaseClient>();

/** Conexão da transação atual, se houver uma aberta. */
export function currentTransaction(): DatabaseClient | undefined {
  return transactionStorage.getStore();
}

/**
 * Executa `work` dentro de uma transação, devolvendo a conexão ao pool no fim.
 * Sem tenant: use só em migrações, outbox relay e `@PlatformJob`.
 */
export async function withTransaction<T>(
  pool: DatabasePool,
  work: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await transactionStorage.run(client, () => work(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transação **com tenant**: define `app.tenant_id` para as policies de RLS
 * enxergarem o tenant da vez (ADR-012).
 *
 * Usa `set_config(..., true)` (equivalente a `SET LOCAL`), que morre no fim da
 * transação e por isso é compatível com o PgBouncer em modo transaction
 * (armadilha #6 do `07-infraestrutura-railway.md`). Um `SET` de sessão vazaria
 * o tenant para a próxima requisição que pegasse a mesma conexão.
 */
export async function withTenantTx<T>(
  pool: DatabasePool,
  work: (client: DatabaseClient) => Promise<T>,
  tenantId: string = requireTenant().tenantId,
): Promise<T> {
  return withTransaction(pool, async (client) => {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return work(client);
  });
}

/**
 * Roda `work` na transação em andamento; se não houver, abre uma com o tenant
 * do contexto. É o que permite um caso de uso agrupar várias chamadas de
 * repositório (e o evento do outbox) em **uma** transação.
 */
export async function useTenantClient<T>(
  pool: DatabasePool,
  work: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = currentTransaction();
  return client === undefined ? withTenantTx(pool, work) : work(client);
}
