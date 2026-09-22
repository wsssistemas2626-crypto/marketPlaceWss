import { requireTenant } from '../tenancy/tenant-context.js';
import type { DatabaseClient } from './pool.js';

/**
 * Próximo número de uma sequência **por tenant** (pedido, fatura, ticket).
 *
 * IDs internos são UUID v7 globais; o número amigável é por tenant para não
 * expor o volume de um tenant a outro (`06-multi-tenancy.md` §3.4). O UPSERT
 * com `RETURNING` é atômico: duas requisições simultâneas nunca recebem o
 * mesmo número.
 *
 * Roda na transação do caso de uso — se ele falhar, o número não é consumido.
 */
export async function nextTenantCounter(
  client: DatabaseClient,
  name: string,
  tenantId: string = requireTenant().tenantId,
): Promise<number> {
  const { rows } = await client.query<{ value: string }>(
    `INSERT INTO platform.tenant_counters (tenant_id, name, value)
          VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, name)
     DO UPDATE SET value = platform.tenant_counters.value + 1
       RETURNING value`,
    [tenantId, name],
  );

  return Number(rows[0]?.value ?? 0);
}
