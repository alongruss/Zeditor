import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, centerOf, field, openEditorForEachTest, shapeBounds, treeItem } from './helpers';

openEditorForEachTest(test);

const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Enter');
  await expect(frameField(page)).toHaveValue(String(frame));
}

/** Cone 1 slides fast: X 0 to -25 over the 90 frames. */
async function slideCone(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await field(page, 'Position X').fill('0');
  await field(page, 'Position X').press('Tab');
  await page.getByRole('button', { name: /^Animate Position at frame 0/ }).click();
  await goToFrame(page, 89);
  await field(page, 'Position X').fill('-25');
  await field(page, 'Position X').press('Tab');
  await goToFrame(page, 0);
}

test('playback moves on every screen refresh, not only on whole frames', async ({ page }) => {
  // The slow project delays every animation frame by 250 ms on purpose: there are no refreshes to count.
  test.skip(test.info().project.name === 'slow', 'animation frames are held back there');
  await slideCone(page);
  await page.getByRole('button', { name: 'Play' }).click();
  // Where the cone is drawn on each screen refresh, for a second.
  const xs = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const xs: number[] = [];
        const start = performance.now();
        const step = (now: number) => {
          const cone = document.querySelector('svg.scene [data-shape-id="cone-1"]');
          if (cone) xs.push(cone.getBoundingClientRect().left);
          if (now - start < 1000) requestAnimationFrame(step);
          else done(xs);
        };
        requestAnimationFrame(step);
      }),
  );
  await page.getByRole('button', { name: 'Pause' }).click();
  const moved = xs.slice(1).filter((x, i) => Math.abs(x - xs[i]) > 0.01).length;
  // At 30 fps on a 60 Hz screen, whole frames would move on about half of the refreshes.
  expect(xs.length).toBeGreaterThan(20);
  expect(moved / (xs.length - 1)).toBeGreaterThan(0.85);
});

test('the gizmo hides while playing, and a pause lands on the whole frame in the Frame box', async ({ page }) => {
  await slideCone(page);
  const gizmo = page.locator('svg.gizmo');
  await expect(gizmo).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(gizmo).toHaveCount(0);
  // Let it play a few frames (however slow the machine), then pause.
  await expect.poll(async () => Number(await frameField(page).inputValue())).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(gizmo).toBeVisible();

  const frame = Number(await frameField(page).inputValue());
  expect(frame).toBeGreaterThan(0);
  await afterRedraw(page);
  const paused = centerOf(await shapeBounds(page, 'cone-1'))!;
  // The same frame, chosen by hand, draws the cone in the same place.
  await goToFrame(page, frame === 89 ? 88 : frame + 1);
  await goToFrame(page, frame);
  await afterRedraw(page);
  const chosen = centerOf(await shapeBounds(page, 'cone-1'))!;
  expect(Math.abs(paused.x - chosen.x)).toBeLessThan(0.5);
});
