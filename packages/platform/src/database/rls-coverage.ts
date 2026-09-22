import type { DatabasePool } from './pool.js';

export interface RlsGap {
  readonly schema: string;
  readonly table: string;
  readonly enabled: boolean;
  readonly forced: boolean;
  readonly policies: number;
}

/** Schemas de infraestrutura do Postgres, fora do nosso controle. */
const IGNORED_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

/**
 * Lista tabelas que têm `tenant_id` mas **não** estão protegidas por RLS:
 * sem `ENABLE`, sem `FORCE` ou sem nenhuma policy.
 *
 * É a checagem que o CI roda (`tenancy/rls-coverage`, US-071): qualquer
 * migração nova que esqueça o RLS quebra o build em vez de virar vazamento
 * entre tenants meses depois.
 */
export async function findTablesMissingTenantRls(pool: DatabasePool): Promise<RlsGap[]> {
  const { rows } = await pool.query<RlsGap>(
    `SELECT n.nspname                AS schema,
            c.relname                AS table,
            c.relrowsecurity         AS enabled,
            c.relforcerowsecurity    AS forced,
            (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname <> ALL ($1::text[])
        AND EXISTS (
              SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = c.oid
                 AND a.attname = 'tenant_id'
                 AND a.attnum > 0
                 AND NOT a.attisdropped
            )
        AND (c.relrowsecurity IS FALSE
             OR c.relforcerowsecurity IS FALSE
             OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
      ORDER BY 1, 2`,
    [IGNORED_SCHEMAS],
  );

  return rows;
}

/** Mensagem pronta para o log do CI. */
export function describeRlsGaps(gaps: readonly RlsGap[]): string {
  return gaps
    .map(
      (gap) =>
        `${gap.schema}.${gap.table}: enable=${gap.enabled}, force=${gap.forced}, policies=${gap.policies}`,
    )
    .join('\n');
}
