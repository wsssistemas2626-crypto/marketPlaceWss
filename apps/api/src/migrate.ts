import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateFromCli } from '@mkt/platform';

import { loadApiEnv } from './env.js';

/**
 * Entrypoint das migrações: `pnpm db:migrate` local e `node dist/migrate.js`
 * no `preDeployCommand` da api na Railway (ADR-014 §3).
 *
 * Roda com o role `migrator` e **só aqui** — o worker nunca migra, e a nova
 * versão só recebe tráfego depois que isto termina (armadilha #7).
 */
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  process.env.MIGRATIONS_ROOT ?? '../../..',
);

async function main(): Promise<void> {
  const { migratorUrl } = loadApiEnv();
  if (migratorUrl === undefined) {
    throw new Error('DATABASE_URL_MIGRATOR é obrigatória para rodar migrações');
  }

  await migrateFromCli(repositoryRoot, migratorUrl);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
