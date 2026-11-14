import { test as base, expect } from '@playwright/test';

/** Options a Playwright project can set for these tests. */
export interface TestOptions {
  /** How many times slower the page's CPU runs (1 = normal). */
  readonly cpuSlowdown: number;
  /**
   * Milliseconds each animation frame (`requestAnimationFrame`) is held back
   * (0 = normal). Work that waits for the next paint, such as Preact effects
   * and the viewport's redraws, then happens late, as on a slow machine.
   */
  readonly frameDelay: number;
  /**
   * Extra milliseconds added to every timer of 50 ms or more (0 = normal).
   * Preact's effects wait for the next frame or a 100 ms timer, whichever
   * comes first, so both must be late for work like opening a dialog to
   * happen after the test's next action, as it did on GitHub's machines.
   */
  readonly timerDelay: number;
}

/**
 * Every browser test imports `test` and `expect` from here.
 *
 * The "slow" project runs every test on a page that behaves like a slow
 * machine: its CPU is slowed with Chromium's own throttling (as in DevTools),
 * and its animation frames arrive late. The bugs that only showed up on
 * GitHub's slower Linux machines were all of this kind, e.g. a test pressing
 * Esc before a dialog had opened. Run `npm run test:e2e:slow` (or
 * `npm run verify`) before pushing.
 */
export const test = base.extend<TestOptions & { slowMachine: void }>({
  cpuSlowdown: [1, { option: true }],
  frameDelay: [0, { option: true }],
  timerDelay: [0, { option: true }],
  slowMachine: [
    async ({ page, cpuSlowdown, frameDelay, timerDelay }, use) => {
      if (cpuSlowdown > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
      }
      if (frameDelay > 0) {
        await page.addInitScript((delay: number) => {
          // Frames still come in order and still get a timestamp; they just come late.
          window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), delay);
          window.cancelAnimationFrame = (id) => window.clearTimeout(id);
        }, frameDelay);
      }
      if (timerDelay > 0) {
        await page.addInitScript((extra: number) => {
          const setTimer = window.setTimeout.bind(window);
          window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
            setTimer(handler, delay !== undefined && delay >= 50 ? delay + extra : delay, ...args)) as typeof window.setTimeout;
        }, timerDelay);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
