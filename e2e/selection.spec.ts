import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, arrow, emptyPoint, inspector, openEditorForEachTest, orbit, ring, shapeBounds, treeItem } from './helpers';

openEditorForEachTest(test);

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' });
const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });

/** Every point of every enabled gizmo handle, in page coordinates. */
async function handlePoints(page: Page) {
  const points: { x: number; y: number }[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const { from, to } = await arrow(page, axis);
    for (let i = 0; i <= 10; i++) points.push({ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 });
    points.push(...(await ring(page, axis)));
  }
  return points;
}

test("the selection's toolbar never covers a gizmo handle", async ({ page }) => {
  const check = async (name: string) => {
    await treeItem(page, name).click();
    await afterRedraw(page);
    const box = (await toolbar(page).boundingBox())!;
    // The handles' grab strokes reach 7px past their lines.
    const grown = { left: box.x - 7, top: box.y - 7, right: box.x + box.width + 7, bottom: box.y + box.height + 7 };
    const inside = (await handlePoints(page)).filter(
      (p) => p.x > grown.left && p.x < grown.right && p.y > grown.top && p.y < grown.bottom,
    );
    expect(inside, `${name}: handle points under the toolbar`).toEqual([]);
  };
  await check('Cone 1');
  await check('Box 1');
  await orbit(page, 80, -50);
  await check('Cone 1');
  await check('Box 1');
  await page.setViewportSize({ width: 900, height: 600 });
  await afterRedraw(page);
  await check('Cone 1');
});

test('the toolbar is one Tab stop: arrows move inside it, Escape gives focus to the scene', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await toolbar(page).getByRole('button', { name: 'Duplicate' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar(page).getByRole('button', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(toolbar(page).getByRole('button', { name: 'Key transform' })).toBeFocused();
  // The arrows stayed in the toolbar: the playhead didn't move.
  await expect(frameField(page)).toHaveValue('0');
  await expect(toolbar(page).getByRole('button', { name: 'Duplicate' })).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('Escape');
  await expect(page.locator('svg.scene')).toBeFocused();
  await expect(inspector(page).getByText('Select a shape or camera to edit it.')).toBeVisible();
  await expect(toolbar(page)).toHaveCount(0);
  // The ring is drawn over the viewport: white and ink bands.
  const ring = await page.locator('.viewport').evaluate((el) => getComputedStyle(el, '::after').boxShadow);
  expect(ring).toContain('inset');
  expect(ring.match(/inset/g)).toHaveLength(2);
});

test('Delete from the toolbar focuses the next row; Duplicate keeps focus; Key transform keys it', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await toolbar(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(treeItem(page, 'Cone 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(toolbar(page).getByRole('button', { name: 'Duplicate' })).toBeFocused();

  const key = toolbar(page).getByRole('button', { name: 'Key transform' });
  await expect(key).toHaveAttribute('aria-pressed', 'false');
  await key.click();
  await expect(key).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: /^Cone 2 keys on frame 0/ })).toBeVisible();

  await treeItem(page, 'Cone 1').click();
  await toolbar(page).getByRole('button', { name: 'Delete' }).click();
  await expect(treeItem(page, 'Cone 1')).toHaveCount(0);
  // Cone 1's row is taken by the next one (its copy, made just after it), which gets focus.
  await expect(treeItem(page, 'Cone 2')).toBeFocused();
});

test('the toolbar hides while playing, and Ctrl+D still duplicates', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await expect(toolbar(page)).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(toolbar(page)).toHaveCount(0);
  await page.keyboard.press('Control+d');
  await expect(treeItem(page, 'Box 2')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(toolbar(page)).toBeVisible();
});

test('the Add menu is a grid of pictures you can walk with the arrow keys', async ({ page }) => {
  await page.getByRole('button', { name: 'Add ▾' }).click();
  const menu = page.getByRole('menu', { name: 'Add' });
  await expect(menu.getByRole('menuitem')).toHaveCount(10);
  await expect(menu.getByRole('menuitem', { name: 'Rectangle', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(menu.getByRole('menuitem', { name: 'Rounded rectangle' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Dot' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Camera' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  // Camera starts its own row, so Up goes to the tile above it: Cylinder.
  await expect(menu.getByRole('menuitem', { name: 'Cylinder' })).toBeFocused();
  await expect(frameField(page)).toHaveValue('0');
  // Each tile shows its shape, drawn by zdog.
  await expect(menu.locator('.tile-svg svg path, .tile-svg svg circle').first()).toBeAttached();

  // Nothing covers the menu, not even the timeline.
  const box = (await menu.boundingBox())!;
  const covered = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menu"]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height - 6 },
  );
  expect(covered).toBe(true);

  await page.keyboard.press('Enter');
  await expect(treeItem(page, 'Cylinder 2')).toHaveAttribute('aria-pressed', 'true');

  // Escape closes it and gives focus back to the button.
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Add' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add ▾' })).toBeFocused();
});

test('right-clicking empty space adds a shape right there', async ({ page }) => {
  const point = await emptyPoint(page);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Add here' });
  await menu.getByRole('menuitem', { name: 'Box' }).click();
  await expect(treeItem(page, 'Box 2')).toHaveAttribute('aria-pressed', 'true');
  await afterRedraw(page);
  const bounds = (await shapeBounds(page, 'box-2'))!;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  // Positions are rounded to half units, so allow a little.
  expect(Math.abs(center.x - point.x)).toBeLessThan(24);
  expect(Math.abs(center.y - point.y)).toBeLessThan(24);
});
