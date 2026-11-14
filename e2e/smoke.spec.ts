import { expect, test, type Page } from '@playwright/test';

/** Collects uncaught errors and console errors, ignoring the web-font request. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location().url ?? '';
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) return;
    errors.push(message.text());
  });
  return errors;
}

/** Asserts the scene is drawn, has a valid viewBox, and stays inside its column. */
async function expectSceneInsideColumn(page: Page) {
  const svg = page.locator('svg.scene');
  await expect(svg.locator('path').first()).toBeAttached();
  // Nine shapes, several of which are made of more than one path.
  expect(await svg.locator('path').count()).toBeGreaterThan(9);

  await expect
    .poll(async () => {
      const viewBox = (await svg.getAttribute('viewBox')) ?? '';
      const numbers = viewBox.trim().split(/\s+/).map(Number);
      return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0;
    }, { message: 'viewBox should be four finite numbers with a positive size' })
    .toBe(true);

  const column = await page.locator('.viewport').boundingBox();
  const svgBox = await svg.boundingBox();
  expect(column).not.toBeNull();
  expect(svgBox).not.toBeNull();
  // The SVG fills its column exactly, not the window.
  expect(svgBox!.x).toBeCloseTo(column!.x, 0);
  expect(svgBox!.width).toBeCloseTo(column!.width, 0);
  expect(svgBox!.height).toBeCloseTo(column!.height, 0);

  // Every drawn path lies inside the column, so nothing hides under a side panel.
  const outside = await svg.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('path')]
      .map((path) => path.getBoundingClientRect())
      .filter((r) => r.width > 0 || r.height > 0)
      .filter(
        (r) =>
          r.left < bounds.left - 1 ||
          r.right > bounds.right + 1 ||
          r.top < bounds.top - 1 ||
          r.bottom > bounds.bottom + 1,
      ).length;
  });
  expect(outside, 'paths drawn outside the viewport column').toBe(0);
}

test('starter scene is visible inside the middle column on first load', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await expectSceneInsideColumn(page);
  expect(errors).toEqual([]);
});

test('scene re-fits its column after the window is resized', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await expectSceneInsideColumn(page);

  await page.setViewportSize({ width: 900, height: 600 });
  await expectSceneInsideColumn(page);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await expectSceneInsideColumn(page);

  expect(errors).toEqual([]);
});
