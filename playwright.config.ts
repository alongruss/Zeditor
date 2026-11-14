import { defineConfig, devices } from '@playwright/test';
import type { TestOptions } from './e2e/fixtures';

const isCI = Boolean(process.env.CI);
const port = 4173;

export default defineConfig<TestOptions>({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The same tests on a page that behaves like a slow machine: a 4x slower CPU,
    // and animation frames and timers (so Preact effects and redraws) running late.
    // Run with `npm run test:e2e:slow` before pushing; CI runs the normal project.
    {
      name: 'slow',
      use: { ...devices['Desktop Chrome'], cpuSlowdown: 4, frameDelay: 250, timerDelay: 250 },
      timeout: 120_000,
      expect: { timeout: 20_000 },
    },
  ],
  // Test the production build, which is what GitHub Pages serves.
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !isCI,
  },
});
