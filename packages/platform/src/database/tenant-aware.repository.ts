import { requireTenant } from '../tenancy/tenant-context.js';
import type { DatabaseClient, DatabasePool } from './pool.js';
import { useTenantClient } from './unit-of-work.js';

/**
 * Base dos repositórios de módulo.
 *
 * Herdando daqui, toda consulta roda dentro de uma transação com
 * `SET LOCAL app.tenant_id`, e as policies de RLS aplicam o filtro por tenant.
 * O repositório **não escreve `WHERE tenant_id = ...`** — esquecer o filtro
 * deixa de ser um vazamento e passa a ser "zero linhas" (ADR-012).
 *
 * Não use o pool cru dentro de um módulo: é exatamente o que o CLAUDE.md §4.11
 * proíbe.
 */
export abstract class TenantAwareRepository {
  protected constructor(protected readonly pool: DatabasePool) {}

  /** Tenant da requisição/job atual. Lança se o contexto não foi aberto. */
  protected get tenantId(): string {
    return requireTenant().tenantId;
  }

  /**
   * Executa na transação em andamento ou abre uma nova com o tenant do
   * contexto — é o que permite agrupar agregado + outbox na mesma transação.
   */
  protected withTenant<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return useTenantClient(this.pool, work);
  }
}
