import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // node:sqlite is stable in practice but still flagged experimental in Node 22.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
