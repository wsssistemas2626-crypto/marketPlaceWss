import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Testcontainers sobe um Postgres real: precisa de mais que o padrão
    testTimeout: 60_000,
    hookTimeout: 180_000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
