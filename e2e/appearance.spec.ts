import { expect, test, type Page } from '@playwright/test';
import { openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

/** The fill colors a shape's SVG elements are drawn with (skipping unfilled ones). */
const fills = (page: Page, id: string) =>
  page.locator('svg.scene').evaluate(
    (svg, shapeId) =>
      [...svg.querySelectorAll(`[data-shape-id="${shapeId}"]`)]
        .map((element) => element.getAttribute('fill'))
        .filter((fill): fill is string => fill !== null && fill !== 'none'),
    id,
  );

test('Opacity fades every part of the shape, and undoes in one step', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  const before = await fills(page, 'box-1');
  expect(before.length).toBeGreaterThanOrEqual(6);
  expect(before.every((fill) => /^#[0-9a-f]{6}$/i.test(fill))).toBe(true);

  const opacity = page.getByLabel('Opacity', { exact: true });
  await opacity.fill('50');
  await opacity.press('Tab');
  // 50% of a solid color is alpha 0x80 on every face, own colors included.
  await expect.poll(() => fills(page, 'box-1')).toEqual(before.map((fill) => `${fill.toLowerCase()}80`));
  // Other shapes are untouched, and the stored colors keep no alpha.
  expect((await fills(page, 'cone-1')).every((fill) => fill.length === 7)).toBe(true);
  await expect(page.getByLabel('Color hex', { exact: true })).toHaveValue('#ee6622');

  await page.keyboard.press('Control+z');
  await expect(opacity).toHaveValue('100');
  await expect.poll(() => fills(page, 'box-1')).toEqual(before);
});

test('each color has an alpha field that edits the hex value', async ({ page }) => {
  await treeItem(page, 'Rounded rectangle 1').click();
  // The 2020 scene gave this shape #33AA6633, which is 20% alpha.
  const alpha = page.getByLabel('Color alpha', { exact: true });
  await expect(alpha).toHaveValue('20');

  await alpha.fill('100');
  await expect(page.getByLabel('Color hex', { exact: true })).toHaveValue('#33aa66');
  await alpha.fill('50');
  await expect(page.getByLabel('Color hex', { exact: true })).toHaveValue('#33aa6680');
  await alpha.press('Tab');

  // Typing alpha into the hex box updates the alpha field.
  const hex = page.getByLabel('Color hex', { exact: true });
  await hex.fill('#33aa6600');
  await expect(alpha).toHaveValue('0');
  await hex.press('Tab');

  // Each visit to a field is one undo step.
  await page.keyboard.press('Control+z');
  await expect(alpha).toHaveValue('50');
  await page.keyboard.press('Control+z');
  await expect(alpha).toHaveValue('20');
});

test('a Box face using the main color has no alpha of its own to edit', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await expect(page.getByLabel('Front face alpha', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Top face alpha', { exact: true })).toBeEnabled();

  await page.getByLabel('Front face has its own color', { exact: true }).check();
  await expect(page.getByLabel('Front face alpha', { exact: true })).toBeEnabled();
});
