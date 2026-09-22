import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error — preset em JavaScript, sem tipos próprios
import { boundariesConfig } from '../eslint/boundaries.js';

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Regras disparadas ao lintar um arquivo do repositório-fixture. */
type Violations = { ruleIds: string[]; messages: string[] };

let lint: (relativePath: string) => Promise<Violations>;

beforeAll(() => {
  const eslint = new ESLint({
    cwd: fixturesRoot,
    overrideConfigFile: true,
    overrideConfig: boundariesConfig,
  });

  lint = async (relativePath) => {
    const [result] = await eslint.lintFiles([path.join(fixturesRoot, relativePath)]);
    const messages = result?.messages ?? [];
    return {
      ruleIds: messages.map((message) => message.ruleId ?? 'unknown'),
      messages: messages.map((message) => message.message),
    };
  };
});

describe('fronteiras entre módulos (CLAUDE.md §4)', () => {
  it('quebra ao importar arquivo interno de outro módulo', async () => {
    const { ruleIds, messages } = await lint('packages/modules/orders/src/domain/cross-module-relative.ts');

    expect(ruleIds).toContain('no-restricted-imports');
    expect(messages.join(' ')).toContain('fachada');
  });

  it('quebra ao importar um subcaminho do pacote de outro módulo', async () => {
    const { ruleIds } = await lint('packages/modules/orders/src/application/package-subpath.ts');

    expect(ruleIds).toContain('no-restricted-imports');
  });

  it('aceita a fachada pública de outro módulo', async () => {
    const { ruleIds } = await lint('packages/modules/orders/src/application/facade-ok.ts');

    expect(ruleIds).toEqual([]);
  });
});

describe('pureza do domínio (CLAUDE.md §4.3)', () => {
  it('quebra ao usar framework dentro de domain/', async () => {
    const { ruleIds, messages } = await lint('packages/modules/orders/src/domain/framework-in-domain.ts');

    expect(ruleIds).toContain('no-restricted-imports');
    expect(messages.join(' ')).toContain('domain/ é puro');
  });

  it('aceita o shared-kernel dentro de domain/', async () => {
    const { ruleIds } = await lint('packages/modules/orders/src/domain/order-ok.ts');

    expect(ruleIds).toEqual([]);
  });
});

describe('SDKs de terceiros (CLAUDE.md §4.4 e §4.15)', () => {
  it('quebra ao importar SDK de provedor dentro de um módulo', async () => {
    const { ruleIds, messages } = await lint('packages/modules/orders/src/infrastructure/third-party-sdk.ts');

    expect(ruleIds).toContain('no-restricted-imports');
    expect(messages.join(' ')).toContain('Port');
  });

  it('quebra ao importar o SDK da Clerk em um adapter que não é o de identidade', async () => {
    const { ruleIds, messages } = await lint('packages/adapters/payment-pagarme/src/index.ts');

    expect(ruleIds).toContain('no-restricted-imports');
    expect(messages.join(' ')).toContain('identity-clerk');
  });

  it('aceita o SDK da Clerk no adapter identity-clerk', async () => {
    const { ruleIds } = await lint('packages/adapters/identity-clerk/src/index.ts');

    expect(ruleIds).toEqual([]);
  });
});
