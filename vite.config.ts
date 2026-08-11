import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    // core/ é a única camada com suíte automatizada (D8) — e não toca DOM.
    environment: 'node',
    include: ['core/**/*.test.ts'],
  },
});
