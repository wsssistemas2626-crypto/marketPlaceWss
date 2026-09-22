import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error — script em JavaScript, sem tipos próprios
import {
  findForbiddenDependencies,
  isAllowedDependency,
  readModuleManifests,
} from '../scripts/check-module-dependencies.mjs';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('lista branca de dependências dos módulos (CLAUDE.md §4.4)', () => {
  it('acusa o SDK de provedor declarado no package.json do módulo', async () => {
    const violations = findForbiddenDependencies(await readModuleManifests(fixturesRoot));

    expect(violations).toEqual([{ module: 'orders', dependency: 'pagarme' }]);
  });

  it('aceita shared-kernel, contracts, platform, Nest e a fachada de outro módulo', () => {
    for (const dependency of [
      '@mkt/shared-kernel',
      '@mkt/contracts',
      '@mkt/platform',
      '@mkt/modules-catalog',
      '@nestjs/common',
      'drizzle-orm',
      'zod',
    ]) {
      expect(isAllowedDependency(dependency), dependency).toBe(true);
    }
  });

  it('recusa SDKs e libs de I/O que deveriam viver em um adapter', () => {
    for (const dependency of ['@clerk/backend', 'stripe', 'axios', 'ioredis', 'nodemailer']) {
      expect(isAllowedDependency(dependency), dependency).toBe(false);
    }
  });

  it('não quebra quando ainda não existe nenhum módulo', async () => {
    const manifests = await readModuleManifests(path.join(fixturesRoot, 'inexistente'));

    expect(manifests).toEqual([]);
  });
});
