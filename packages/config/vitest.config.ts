import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // as fixtures são código proposital de violação; nunca são compiladas
    exclude: ['test/fixtures/**'],
  },
});
