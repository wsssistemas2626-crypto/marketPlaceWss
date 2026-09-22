import type { CloudEvent } from '@mkt/contracts';
import type { DomainEvent } from '@mkt/shared-kernel';

import type { DatabaseClient } from '../database/pool.js';

/** Converte o evento de domínio para o envelope CloudEvents da fila. */
export function toCloudEvent<TData>(event: DomainEvent<TData>): CloudEvent<TData> {
  return {
    specversion: '1.0',
    id: event.id,
    source: event.source,
    type: event.type,
    dataschemaversion: event.dataSchemaVersion,
    time: event.time.toISOString(),
    subject: event.subject,
    tenantid: event.tenantId,
    ...(event.sellerId === undefined ? {} : { sellerid: event.sellerId }),
    ...(event.correlationId === undefined ? {} : { correlationid: event.correlationId }),
    data: event.data,
  };
}

/**
 * Grava o evento na tabela `outbox` **do schema do módulo**, usando a mesma
 * conexão (e portanto a mesma transação) da mudança de estado.
 *
 * É isso que torna impossível "salvou mas não publicou" ou "publicou mas não
 * salvou": ou os dois acontecem, ou nenhum (CLAUDE.md §4.5). Quem publica de
 * fato é o relay do worker.
 */
export async function enqueueOutboxEvent(
  client: DatabaseClient,
  schemaName: string,
  event: DomainEvent,
): Promise<void> {
  const envelope = toCloudEvent(event);

  await client.query(
    `INSERT INTO ${schemaName}.outbox (id, tenant_id, type, payload)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [envelope.id, envelope.tenantid, envelope.type, JSON.stringify(envelope)],
  );
}

export interface OutboxRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly type: string;
  readonly payload: CloudEvent;
  readonly attempts: number;
}

/** SQL da tabela `outbox` de um módulo (usado nas migrações). */
export function createOutboxTableSql(schemaName: string): string {
  return `
CREATE TABLE IF NOT EXISTS ${schemaName}.outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);

-- o relay varre só o que falta publicar
CREATE INDEX IF NOT EXISTS ${schemaName}_outbox_pending_idx
  ON ${schemaName}.outbox (created_at) WHERE published_at IS NULL;

ALTER TABLE ${schemaName}.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schemaName}.outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ${schemaName}.outbox;
CREATE POLICY tenant_isolation ON ${schemaName}.outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- o relay roda com o role platform (BYPASSRLS): precisa ler e marcar publicado
GRANT SELECT, UPDATE ON ${schemaName}.outbox TO platform;`;
}
