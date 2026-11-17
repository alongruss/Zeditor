import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { field, openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' });
const curvesButton = (page: Page) => page.getByRole('button', { name: 'Curves', exact: true });
const easingSelect = (page: Page) => page.getByLabel('Easing of selected keys');
const handle = (page: Page, n: 1 | 2) => timeline(page).locator(`[data-handle="${n}"]`);

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Enter');
  await expect(frameField(page)).toHaveValue(String(frame));
}

async function setField(page: Page, label: string, value: number) {
  await field(page, label).fill(String(value));
  await field(page, label).press('Tab');
}

/** Cone 1 slides from X 0 (frame 0) to X 20 (frame 60), easing in and out. */
async function slideCone(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await setField(page, 'Position X', 0);
  await page.getByRole('button', { name: /^Animate Position at frame 0/ }).click();
  await goToFrame(page, 60);
  await setField(page, 'Position X', 20);
}

async function xOnFrame(page: Page, frame: number): Promise<number> {
  await goToFrame(page, frame);
  return Number(await field(page, 'Position X').inputValue());
}

/** Drags a curve handle by (dx, dy) screen pixels. */
async function dragHandle(page: Page, n: 1 | 2, dx: number, dy: number) {
  const box = (await handle(page, n).boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

test('Curves shows the selected object as graphs; dragging a handle shapes the easing, as one undo step', async ({ page }) => {
  await slideCone(page);
  const before = await xOnFrame(page, 15);

  await curvesButton(page).click();
  await expect(curvesButton(page)).toHaveAttribute('aria-pressed', 'true');
  const legend = timeline(page).getByRole('list', { name: 'Curves' });
  await expect(legend.getByRole('button')).toHaveText(['Position X', 'Position Y', 'Position Z']);

  // Click the key the stretch starts from: its handles appear.
  await expect(handle(page, 1)).toHaveCount(0);
  await timeline(page).getByRole('button', { name: 'Position X key on frame 0, Ease in-out' }).click();
  await expect(handle(page, 1)).toHaveAttribute('aria-label', /time 0.42, amount 0\b/);
  await expect(easingSelect(page)).toHaveValue('easeInOut');

  // Pull the first handle right and down: a slower start.
  await dragHandle(page, 1, 120, 30);
  await expect(easingSelect(page)).toHaveValue('custom');
  await expect(timeline(page).getByRole('button', { name: 'Position X key on frame 0, Custom curve' })).toBeVisible();
  expect(await xOnFrame(page, 15)).toBeLessThan(before - 0.3);

  // The whole drag is one undo step.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(easingSelect(page)).toHaveValue('easeInOut');
  expect(await xOnFrame(page, 15)).toBeCloseTo(before, 3);

  // A preset still applies from the Easing menu.
  await easingSelect(page).selectOption('linear');
  expect(await xOnFrame(page, 15)).toBeCloseTo(5, 3);
});

test('handles can overshoot past the next key, and move with the arrow keys', async ({ page }) => {
  await slideCone(page);
  await curvesButton(page).click();
  await timeline(page).getByRole('button', { name: 'Position X key on frame 0, Ease in-out' }).click();

  // Arrow keys nudge a handle: left is earlier.
  await handle(page, 2).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(handle(page, 2)).toHaveAttribute('aria-label', /time 0.53, amount 1\b/);
  await page.keyboard.press('ArrowUp');
  await expect(handle(page, 2)).toHaveAttribute('aria-label', /time 0.53, amount 1.05\b/);

  // Drag the second handle well above the next key: the cone goes past X 20 before settling.
  await dragHandle(page, 2, 0, -150);
  const near = await xOnFrame(page, 50);
  expect(near).toBeGreaterThan(20);
  expect(await xOnFrame(page, 60)).toBe(20);
});

test('the legend shows one curve at a time; other objects say what to do; Curves off brings the rows back', async ({ page }) => {
  await slideCone(page);
  await curvesButton(page).click();
  const curves = timeline(page).locator('.tl-curve');
  await expect(curves).toHaveCount(3);
  const y = timeline(page).getByRole('button', { name: 'Position Y', exact: true });
  await y.click();
  await expect(y).toHaveAttribute('aria-pressed', 'true');
  await expect(curves).toHaveCount(1);
  await y.click();
  await expect(curves).toHaveCount(3);

  // Showing only Position Y, then picking an object without it, shows all of that object's curves.
  await y.click();
  await treeItem(page, 'Box 1').click();
  await page.getByRole('button', { name: /^Animate Rotation at frame/ }).click();
  await expect(curves).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(timeline(page)).toContainText('Box 1 has no animated numbers yet');

  await curvesButton(page).click();
  await expect(curvesButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(timeline(page).getByRole('button', { name: /^Cone 1 keys on frame 0/ })).toBeVisible();
});
