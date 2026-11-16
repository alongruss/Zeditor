import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, arrowGrip, centerOf, drag, inspector, openEditorForEachTest, pointOnShape, shapeBounds, treeItem } from './helpers';

openEditorForEachTest(test);

const toolbar = (page: Page, count: number) => page.getByRole('toolbar', { name: `Actions for ${count} selected` });
const inside = (page: Page, group: string) => page.getByRole('list', { name: `Inside ${group}` });
const ctrl = process.platform === 'darwin' ? 'Meta' : 'Control';

async function centers(page: Page, ids: string[]) {
  await afterRedraw(page);
  return Promise.all(ids.map(async (id) => centerOf(await shapeBounds(page, id))!));
}

test('Ctrl-click picks several in the tree; Group puts them in one group, each where it was', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await treeItem(page, 'Cone 1').click({ modifiers: [ctrl] });
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector(page)).toContainText('2 selected');
  // Both rows look selected, not just the last one picked.
  for (const name of ['Box 1', 'Cone 1']) await expect(treeItem(page, name)).toHaveCSS('font-weight', '700');
  await expect(treeItem(page, 'Cylinder 1')).not.toHaveCSS('font-weight', '700');
  const before = await centers(page, ['box-1', 'cone-1']);

  await toolbar(page, 2).getByRole('button', { name: 'Group', exact: true }).click();
  await expect(treeItem(page, 'Group 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(inside(page, 'Group 1').getByRole('button', { name: /^Box 1/ })).toBeVisible();
  await expect(inside(page, 'Group 1').getByRole('button', { name: /^Cone 1/ })).toBeVisible();
  const after = await centers(page, ['box-1', 'cone-1']);
  after.forEach((p, i) => {
    expect(Math.abs(p.x - before[i].x)).toBeLessThan(1);
    expect(Math.abs(p.y - before[i].y)).toBeLessThan(1);
  });

  // Ctrl-click again takes one out of the selection.
  await treeItem(page, 'Box 1').click();
  await treeItem(page, 'Cone 1').click({ modifiers: [ctrl] });
  await treeItem(page, 'Cone 1').click({ modifiers: [ctrl] });
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(inspector(page)).not.toContainText('selected');
});

test('Shift-click selects the rows between; Delete removes them all and Undo brings them back', async ({ page }) => {
  const rows = page.getByRole('list', { name: 'Shapes' }).getByRole('button', { pressed: false });
  const names = (await rows.allInnerTexts()).map((text) => text.split('\n')[0]);
  await treeItem(page, names[1]).click();
  await treeItem(page, names[3]).click({ modifiers: ['Shift'] });
  for (const name of names.slice(1, 4)) await expect(treeItem(page, name)).toHaveAttribute('aria-pressed', 'true');
  await expect(treeItem(page, names[0])).toHaveAttribute('aria-pressed', 'false');
  await expect(inspector(page)).toContainText('3 selected');

  await page.locator('svg.scene').focus();
  await page.keyboard.press('Delete');
  for (const name of names.slice(1, 4)) await expect(treeItem(page, name)).toHaveCount(0);
  await expect(treeItem(page, names[0])).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  for (const name of names.slice(1, 4)) await expect(treeItem(page, name)).toBeVisible();
});

test('Ctrl-click in the scene adds a shape; the gizmo moves both together, as one undo step', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  const cone = await pointOnShape(page, 'cone-1');
  await page.keyboard.down(ctrl);
  await page.mouse.click(cone.x, cone.y);
  await page.keyboard.up(ctrl);
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');
  // Several: arrows only (turning them together needs a group).
  await expect(page.locator('.gizmo [data-handle^="rotate-"]')).toHaveCount(0);

  const before = await centers(page, ['box-1', 'cone-1']);
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 60, y: grip.y }]);
  const after = await centers(page, ['box-1', 'cone-1']);
  const shift = after.map((p, i) => p.x - before[i].x);
  expect(shift[0]).toBeGreaterThan(20);
  expect(Math.abs(shift[0] - shift[1])).toBeLessThan(2);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const back = await centers(page, ['box-1', 'cone-1']);
  back.forEach((p, i) => expect(Math.abs(p.x - before[i].x)).toBeLessThan(1));
  // Undo kept both selected.
  await expect(inspector(page)).toContainText('2 selected');
});

test('Ctrl+A selects everything; right-clicking part of it offers actions for all of it', async ({ page }) => {
  await page.locator('svg.scene').focus();
  await page.keyboard.press(`${ctrl}+a`);
  const count = await page.getByRole('list', { name: 'Shapes' }).getByRole('button', { pressed: true }).count();
  expect(count).toBeGreaterThan(3);
  await expect(inspector(page)).toContainText(`selected`);

  const box = await pointOnShape(page, 'box-1');
  await page.mouse.click(box.x, box.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: /^Actions for \d+ selected$/ });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Group/ }).click();
  await expect(page.getByRole('list', { name: 'Shapes' }).getByRole('listitem')).toHaveCount(1 + count);
  await expect(treeItem(page, 'Group 1')).toHaveAttribute('aria-pressed', 'true');
});
