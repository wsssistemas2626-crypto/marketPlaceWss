import type { CloudEvent } from '@mkt/contracts';

import type { DatabasePool } from '../database/pool.js';
import { withTenantTx } from '../database/unit-of-work.js';
import { runWithTenant, type TenantContext } from '../tenancy/tenant-context.js';

export interface ConsumeResult {
  readonly processed: boolean;
  /** `true` quando o evento já tinha sido processado por este handler. */
  readonly duplicate: boolean;
}

/**
 * Processa um evento **uma única vez por handler**.
 *
 * A entrega é at-least-once (o relay pode republicar após uma falha de rede),
 * então a chave de idempotência é `event.id` + nome do handler
 * (CLAUDE.md §4.5). O registro em `platform.processed_events` e o efeito do
 * handler ficam na **mesma transação**: ou os dois valem, ou nenhum.
 *
 * O TenantContext é reaberto a partir do `tenantid` do envelope — é assim que
 * um job sabe em que tenant está (ADR-012).
 */
export async function consumeOnce(
  pool: DatabasePool,
  event: CloudEvent,
  handlerName: string,
  handle: (event: CloudEvent) => Promise<void>,
  tenantContext?: TenantContext,
): Promise<ConsumeResult> {
  const context: TenantContext = tenantContext ?? {
    tenantId: event.tenantid,
    slug: 'unknown',
    status: 'active',
    cell: 'shared-1',
  };

  return runWithTenant(context, async () =>
    withTenantTx(
      pool,
      async (client) => {
        const inserted = await client.query(
          `INSERT INTO platform.processed_events (event_id, handler, tenant_id, event_type)
                VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, handler) DO NOTHING`,
          [event.id, handlerName, event.tenantid, event.type],
        );

        if (inserted.rowCount === 0) {
          return { processed: false, duplicate: true };
        }

        await handle(event);
        return { processed: true, duplicate: false };
      },
      event.tenantid,
    ),
  );
}
