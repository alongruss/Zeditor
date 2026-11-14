import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser tests live in e2e/ and run with Playwright, not Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
