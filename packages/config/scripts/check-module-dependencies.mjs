#!/usr/bin/env node
/**
 * Lista branca de dependências dos módulos (CLAUDE.md §4.4 e §9).
 *
 * Com o pnpm, um pacote só importa o que declara — então checar o `package.json`
 * de cada módulo pega qualquer SDK de terceiro, inclusive os que o ESLint não
 * enumera. Incluir um pacote novo aqui é uma decisão consciente (e, se for
 * framework/banco/broker, exige ADR).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Pacotes que um módulo pode declarar em `dependencies`. */
export const ALLOWED_MODULE_DEPENDENCIES = [
  '@mkt/shared-kernel',
  '@mkt/contracts',
  '@mkt/platform',
  '@mkt/modules-*',
  '@nestjs/common',
  '@nestjs/core',
  'drizzle-orm',
  'pg',
  'postgres',
  'reflect-metadata',
  'rxjs',
  'zod',
];

const matches = (dependency, pattern) =>
  pattern.endsWith('*') ? dependency.startsWith(pattern.slice(0, -1)) : dependency === pattern;

export const isAllowedDependency = (dependency, allowed = ALLOWED_MODULE_DEPENDENCIES) =>
  allowed.some((pattern) => matches(dependency, pattern));

/**
 * @param {{ module: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }[]} modules
 * @returns {{ module: string, dependency: string }[]} violações encontradas
 */
export function findForbiddenDependencies(modules, allowed = ALLOWED_MODULE_DEPENDENCIES) {
  return modules.flatMap(({ module, dependencies = {}, peerDependencies = {} }) =>
    [...Object.keys(dependencies), ...Object.keys(peerDependencies)]
      .filter((dependency) => !isAllowedDependency(dependency, allowed))
      .map((dependency) => ({ module, dependency })),
  );
}

/** Lê `packages/modules/&#42;/package.json` a partir da raiz informada. */
export async function readModuleManifests(rootPath) {
  const modulesDir = path.join(rootPath, 'packages', 'modules');
  let entries;
  try {
    entries = await readdir(modulesDir, { withFileTypes: true });
  } catch {
    return []; // ainda não existem módulos (Fase 0)
  }

  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifestPath = path.join(modulesDir, entry.name, 'package.json');
        try {
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
          return { module: entry.name, ...manifest };
        } catch {
          return undefined;
        }
      }),
  );

  return manifests.filter((manifest) => manifest !== undefined);
}

async function main() {
  const rootPath = process.argv[2] ?? process.cwd();
  const violations = findForbiddenDependencies(await readModuleManifests(rootPath));

  if (violations.length === 0) {
    console.log('Dependências dos módulos OK.');
    return;
  }

  for (const { module, dependency } of violations) {
    console.error(
      `packages/modules/${module}: dependência proibida "${dependency}". ` +
        'Um módulo não importa SDK de terceiro (CLAUDE.md §4.4): declare um Port e crie um adapter em packages/adapters/*.',
    );
  }
  process.exitCode = 1;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('check-module-dependencies.mjs')
) {
  await main();
}
