import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createPool, type DatabasePool } from './pool.js';
import { withTransaction } from './unit-of-work.js';

export interface Migration {
  /** Módulo dono da migração (nome da pasta em `packages/modules`). */
  readonly module: string;
  /** Nome do arquivo, que também é a ordem (`0001_init.sql`). */
  readonly name: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

const REGISTRY_SQL = `
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION migrator;
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  module text NOT NULL,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, name)
);`;

/**
 * Lê as migrações de todos os módulos: `packages/modules/<modulo>/drizzle/*.sql`,
 * em ordem lexicográfica dentro de cada módulo (por isso o prefixo numérico).
 */
export async function discoverMigrations(repositoryRoot: string): Promise<Migration[]> {
  const modulesDir = path.join(repositoryRoot, 'packages', 'modules');

  let moduleDirs: string[];
  try {
    moduleDirs = (await readdir(modulesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const migrations: Migration[] = [];
  for (const moduleName of moduleDirs) {
    const migrationsDir = path.join(modulesDir, moduleName, 'drizzle');
    let files: string[];
    try {
      files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    } catch {
      continue;
    }

    for (const name of files) {
      migrations.push({
        module: moduleName,
        name,
        sql: await readFile(path.join(migrationsDir, name), 'utf8'),
      });
    }
  }

  return migrations;
}

/**
 * Aplica as migrações pendentes com o role `migrator`.
 *
 * Cada arquivo roda na **sua própria transação** e é registrado em
 * `platform.schema_migrations`: rodar duas vezes não reaplica nada. O padrão
 * é expand/contract (ADR-014, armadilha #7), então a versão anterior do código
 * continua funcionando enquanto o deploy acontece.
 */
export async function runMigrations(
  pool: DatabasePool,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  await withTransaction(pool, (client) => client.query(REGISTRY_SQL));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    const id = `${migration.module}/${migration.name}`;
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM platform.schema_migrations WHERE module = $1 AND name = $2',
      [migration.module, migration.name],
    );

    if (alreadyApplied.rowCount !== null && alreadyApplied.rowCount > 0) {
      skipped.push(id);
      continue;
    }

    await withTransaction(pool, async (client) => {
      await client.query(migration.sql);
      await client.query('INSERT INTO platform.schema_migrations (module, name) VALUES ($1, $2)', [
        migration.module,
        migration.name,
      ]);
    });
    applied.push(id);
  }

  return { applied, skipped };
}

/**
 * Entrypoint das migrações (`pnpm db:migrate` e `preDeployCommand` da api).
 * Usa **sempre** `DATABASE_URL_MIGRATOR`: o role `app` não é dono dos schemas.
 */
export async function migrateFromCli(
  repositoryRoot: string,
  migratorUrl: string,
  log: (message: string) => void = console.log,
): Promise<MigrationResult> {
  const pool = createPool(migratorUrl, { max: 1, applicationName: 'marketplace-migrator' });
  try {
    const migrations = await discoverMigrations(repositoryRoot);
    const result = await runMigrations(pool, migrations);

    log(
      result.applied.length === 0
        ? `Nenhuma migração pendente (${result.skipped.length} já aplicadas).`
        : `Migrações aplicadas: ${result.applied.join(', ')}`,
    );
    return result;
  } finally {
    await pool.end();
  }
}
