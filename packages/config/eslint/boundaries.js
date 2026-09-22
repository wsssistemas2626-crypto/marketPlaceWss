import tseslint from 'typescript-eslint';

/**
 * Fronteiras da arquitetura (CLAUDE.md §4), verificadas por caminho de import.
 *
 * Roda a partir da raiz do monorepo: `pnpm lint:boundaries`.
 * Os testes em `test/boundaries.test.ts` provam que cada regra quebra o lint.
 *
 * A lista branca de dependências npm de cada módulo é verificada à parte, no
 * `package.json` (`scripts/check-module-dependencies.mjs`): com o pnpm, um
 * pacote só consegue importar o que declara, então a checagem ali pega
 * qualquer SDK — inclusive os que este arquivo não enumera.
 */

const messages = {
  crossModule: 'Um módulo só enxerga outro pela fachada @mkt/modules-<outro> (index.ts) — CLAUDE.md §4.1.',
  domainPure:
    'domain/ é puro (CLAUDE.md §4.3): sem framework, sem I/O, sem SDK — só regras, o próprio domínio e o shared-kernel.',
  inwardOnly:
    'As dependências apontam para dentro: domain/ e application/ não conhecem infrastructure/, http/ nem events/ (CLAUDE.md §4.3).',
  noSdk:
    'SDK de terceiro não entra em packages/modules/* (CLAUDE.md §4.4): declare um Port no módulo e implemente um adapter em packages/adapters/*.',
  clerk:
    'O SDK da Clerk só pode ser importado em packages/adapters/identity-clerk e nos apps Next.js (ADR-013 / CLAUDE.md §4.15).',
};

/** Frameworks, drivers e I/O — nada disso pode cruzar a fronteira do domínio. */
const FRAMEWORKS = ['@nestjs/*', 'reflect-metadata', 'rxjs', 'express', 'next', 'next/*', 'react'];
const IO = [
  'node:*',
  'fs',
  'fs/*',
  'path',
  'crypto',
  'http',
  'https',
  'net',
  'dns',
  'child_process',
  'worker_threads',
];
const PERSISTENCE = ['drizzle-orm', 'drizzle-orm/*', 'pg', 'pg/*', 'postgres', 'ioredis', 'bullmq'];
/** Provedores externos conhecidos — a checagem completa é a do package.json. */
const VENDOR_SDKS = [
  '@clerk/*',
  '@aws-sdk/*',
  'stripe',
  'pagarme',
  'mercadopago',
  'meilisearch',
  'nodemailer',
  'axios',
  'node-fetch',
  'got',
];

/** Vale para qualquer arquivo do repositório. */
const CROSS_MODULE_PATTERNS = [
  // `@mkt/modules-catalog/src/domain/...` — só o pacote inteiro é permitido
  { group: ['@mkt/modules-*/**'], message: messages.crossModule },
  { group: ['**/packages/modules/*/src/**'], message: messages.crossModule },
];

/**
 * Import relativo que sobe até o `src/` de outro pacote. Só é aplicado dentro de
 * packages/modules e packages/adapters: em outros pacotes, um caminho assim
 * (`../src/x.js` a partir de `test/`) é um import interno legítimo.
 */
const RELATIVE_ESCAPE = { group: ['../**/src/**'], message: messages.crossModule };

/** Camadas de dentro não enxergam camadas de fora do mesmo módulo. */
const outwardLayers = (...layers) => ({
  group: layers.flatMap((layer) => [`../${layer}`, `../${layer}/**`, `../../${layer}/**`]),
  message: messages.inwardOnly,
});

const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export const boundariesConfig = tseslint.config(
  // artefatos de build nunca entram na checagem
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts'] },
  {
    files: ['packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: restrict(CROSS_MODULE_PATTERNS),
  },
  {
    // domain/: sem framework, sem I/O, sem driver, sem SDK
    files: ['packages/modules/*/src/domain/**/*.{ts,tsx}'],
    rules: restrict([
      ...CROSS_MODULE_PATTERNS,
      RELATIVE_ESCAPE,
      outwardLayers('application', 'infrastructure', 'http', 'events'),
      { group: [...FRAMEWORKS, ...IO, ...PERSISTENCE, ...VENDOR_SDKS], message: messages.domainPure },
    ]),
  },
  {
    // application/: casos de uso e ports; nada de framework, driver ou SDK
    files: ['packages/modules/*/src/application/**/*.{ts,tsx}'],
    rules: restrict([
      ...CROSS_MODULE_PATTERNS,
      RELATIVE_ESCAPE,
      outwardLayers('infrastructure', 'http', 'events'),
      { group: [...FRAMEWORKS, ...PERSISTENCE], message: messages.inwardOnly },
      { group: VENDOR_SDKS, message: messages.noSdk },
    ]),
  },
  {
    // infrastructure/, http/ e events/ podem usar Nest e o ORM, mas não SDKs de provedor
    files: [
      'packages/modules/*/src/infrastructure/**/*.{ts,tsx}',
      'packages/modules/*/src/http/**/*.{ts,tsx}',
      'packages/modules/*/src/events/**/*.{ts,tsx}',
      'packages/modules/*/src/*.{ts,tsx}',
    ],
    rules: restrict([
      ...CROSS_MODULE_PATTERNS,
      RELATIVE_ESCAPE,
      { group: VENDOR_SDKS, message: messages.noSdk },
    ]),
  },
  {
    // ADR-013: o SDK da Clerk vive no adapter de identidade e nos apps Next.js
    files: ['packages/adapters/*/**/*.{ts,tsx}'],
    ignores: ['packages/adapters/identity-clerk/**'],
    rules: restrict([
      ...CROSS_MODULE_PATTERNS,
      RELATIVE_ESCAPE,
      { group: ['@clerk/*'], message: messages.clerk },
    ]),
  },
);

export default boundariesConfig;
