import { parseEnvelope } from '@mkt/contracts';

import type { DatabasePool } from '../database/pool.js';
import { withTransaction } from '../database/unit-of-work.js';
import type { EventBusPort } from './event-bus.port.js';

export interface RelayOptions {
  /** Schemas de módulo que têm tabela `outbox`. */
  readonly schemas: readonly string[];
  readonly batchSize?: number;
  /** Tentativas antes de mandar para a DLQ. */
  readonly maxAttempts?: number;
  /** Teto do backoff entre tentativas, em segundos. */
  readonly maxBackoffSeconds?: number;
}

export interface RelayResult {
  readonly published: number;
  readonly deadLettered: number;
  readonly failed: number;
}

interface PendingRow {
  readonly id: string;
  readonly payload: unknown;
  readonly attempts: number;
}

/**
 * Publica os eventos pendentes do outbox.
 *
 * Roda no worker com o role `platform` (BYPASSRLS): é um dos três lugares
 * autorizados a enxergar todos os tenants (CLAUDE.md §9). Por isso ele não
 * abre TenantContext — quem restaura o contexto é o consumidor, a partir do
 * `tenantid` do envelope.
 *
 * `FOR UPDATE SKIP LOCKED` permite várias réplicas do worker sem publicar o
 * mesmo evento duas vezes; ainda assim a entrega é *at-least-once*, e por isso
 * o consumidor é idempotente.
 */
export async function relayOutboxBatch(
  platformPool: DatabasePool,
  bus: EventBusPort,
  options: RelayOptions,
): Promise<RelayResult> {
  const batchSize = options.batchSize ?? 50;
  const maxAttempts = options.maxAttempts ?? 5;
  const maxBackoffSeconds = options.maxBackoffSeconds ?? 300;

  let published = 0;
  let deadLettered = 0;
  let failed = 0;

  for (const schema of options.schemas) {
    await withTransaction(platformPool, async (client) => {
      const { rows } = await client.query<PendingRow>(
        `SELECT id, payload, attempts
           FROM ${schema}.outbox
          WHERE published_at IS NULL
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          ORDER BY created_at
          LIMIT $1
            FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );

      for (const row of rows) {
        try {
          const event = parseEnvelope(row.payload);
          await bus.publish(event);
          await client.query(`UPDATE ${schema}.outbox SET published_at = now() WHERE id = $1`, [row.id]);
          published += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const attempts = row.attempts + 1;

          if (attempts >= maxAttempts) {
            // envelope inválido ou barramento indisponível demais: sai da fila principal
            await bus.publishToDeadLetter(row.payload, message);
            await client.query(
              `UPDATE ${schema}.outbox SET attempts = $2, last_error = $3, published_at = now() WHERE id = $1`,
              [row.id, attempts, message],
            );
            deadLettered += 1;
          } else {
            // backoff exponencial: o relay varre a cada segundo, então sem
            // adiar a próxima tentativa uma indisponibilidade curta do
            // barramento gastaria as 5 tentativas em 5 segundos e mandaria
            // eventos perfeitamente válidos para a DLQ
            const delaySeconds = Math.min(2 ** attempts, maxBackoffSeconds);
            await client.query(
              `UPDATE ${schema}.outbox
                  SET attempts = $2,
                      last_error = $3,
                      next_attempt_at = now() + make_interval(secs => $4)
                WHERE id = $1`,
              [row.id, attempts, message, delaySeconds],
            );
            failed += 1;
          }
        }
      }
    });
  }

  return { published, deadLettered, failed };
}
