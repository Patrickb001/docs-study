import { defineConfig } from 'vitest/config';

// Unit tests for the server. The bug checker uses its own config (see src/generator/bugCheck.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Tests use a throwaway database in memory, never your real one.
    env: { DB_FILE: ':memory:', ANTHROPIC_API_KEY: '', FETCH_DELAY_MS: '0' },
    testTimeout: 60_000,
  },
});
