import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // o shared-kernel é a base de todo o domínio: 100% ou o CI quebra (US-003)
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
