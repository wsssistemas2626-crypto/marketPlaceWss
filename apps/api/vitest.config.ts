import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // a suíte de isolamento sobe Postgres e Redis reais
    testTimeout: 120_000,
    hookTimeout: 300_000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
