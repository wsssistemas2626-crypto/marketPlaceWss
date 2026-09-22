import { ValidationError } from '@mkt/shared-kernel';

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(value: string, field: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new ValidationError(
      `Identificador inválido para SQL: "${value}" (use letras minúsculas, dígitos e _)`,
      { field },
    );
  }
  return value;
}

/**
 * SQL de criação do schema de um módulo, conforme
 * `infra/db/module-schema-template.sql`: o schema pertence ao `migrator`,
 * `app` recebe DML e `platform` só leitura por padrão (ADR-003 + ADR-014 §3).
 */
export function createModuleSchemaSql(moduleName: string): string {
  const schema = assertIdentifier(moduleName, 'moduleName');

  return [
    `CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION migrator;`,
    `GRANT USAGE ON SCHEMA ${schema} TO app, platform;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA ${schema}`,
    `  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA ${schema}`,
    `  GRANT USAGE, SELECT ON SEQUENCES TO app;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA ${schema}`,
    `  GRANT SELECT ON TABLES TO platform;`,
  ].join('\n');
}

/**
 * Liga o RLS de uma tabela com `tenant_id`.
 *
 * `FORCE ROW LEVEL SECURITY` é o que faz a policy valer **também para o dono
 * da tabela**; sem ele, uma conexão do `migrator` leria tudo. A policy usa
 * `current_setting('app.tenant_id', true)`, definido por `withTenantTx`.
 */
export function enableTenantRlsSql(schemaName: string, tableName: string): string {
  const schema = assertIdentifier(schemaName, 'schemaName');
  const table = assertIdentifier(tableName, 'tableName');
  const qualified = `${schema}.${table}`;

  return [
    `ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS tenant_isolation ON ${qualified};`,
    `CREATE POLICY tenant_isolation ON ${qualified}`,
    `  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)`,
    `  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);`,
  ].join('\n');
}
