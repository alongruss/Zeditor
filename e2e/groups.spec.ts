import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, arrowGrip, centerOf, drag, field, inspector, openEditorForEachTest, shapeBounds, treeItem } from './helpers';

openEditorForEachTest(test);

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' });
const inside = (page: Page, group: string) => page.getByRole('list', { name: `Inside ${group}` });
const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });

async function coneCenter(page: Page) {
  await afterRedraw(page);
  return centerOf(await shapeBounds(page, 'cone-1'))!;
}

async function setField(page: Page, label: string, value: number) {
  await field(page, label).fill(String(value));
  await field(page, label).press('Tab');
  await expect(field(page, label)).toHaveValue(String(value));
}

test('Group and Ungroup keep a shape where it is; the group moves what is inside it', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const start = await coneCenter(page);

  await toolbar(page).getByRole('button', { name: 'Group', exact: true }).click();
  await expect(treeItem(page, 'Group 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(inside(page, 'Group 1').getByRole('button', { name: /^Cone 1/ })).toBeVisible();
  let now = await coneCenter(page);
  expect(Math.abs(now.x - start.x)).toBeLessThan(1);
  expect(Math.abs(now.y - start.y)).toBeLessThan(1);

  // Turning the group turns the cone around the group's origin (the cone's own position).
  await setField(page, 'Position X', 0);
  now = await coneCenter(page);
  expect(Math.abs(now.x - start.x)).toBeGreaterThan(20);
  const moved = now;

  // Ungroup: the cone stays exactly where the group had put it.
  await toolbar(page).getByRole('button', { name: 'Ungroup' }).click();
  await expect(treeItem(page, 'Group 1')).toHaveCount(0);
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'true');
  now = await coneCenter(page);
  expect(Math.abs(now.x - moved.x)).toBeLessThan(1);
  expect(Math.abs(now.y - moved.y)).toBeLessThan(1);

  // Undo brings the group back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(treeItem(page, 'Group 1')).toBeVisible();
});

test('the Group picker moves a shape into a group, keeping it in place', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await page.keyboard.press('Control+g'); // Group 1 holds Box 1
  await treeItem(page, 'Group 1').click();
  await setField(page, 'Rotation Z', 90);

  await treeItem(page, 'Cone 1').click();
  const start = await coneCenter(page);
  await inspector(page).getByLabel('Group').selectOption({ label: 'Group 1' });
  await expect(inside(page, 'Group 1').getByRole('button', { name: /^Cone 1/ })).toBeVisible();
  const now = await coneCenter(page);
  expect(Math.abs(now.x - start.x)).toBeLessThan(1);
  expect(Math.abs(now.y - start.y)).toBeLessThan(1);
  // Its own values are now in the turned group's space.
  await expect(field(page, 'Position X')).not.toHaveValue('12');
});

test("the gizmo drags a turned group's shape along the world axis", async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await page.keyboard.press('Control+g');
  await setField(page, 'Rotation Z', 90); // the group is selected after grouping
  await treeItem(page, 'Cone 1').click();
  const start = await coneCenter(page);
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 20, y: grip.y }, { x: grip.x + 40, y: grip.y }]);
  // The X arrow is the world's X: the cone follows the pointer right, not up or down.
  await expect.poll(async () => (await coneCenter(page)).x - start.x).toBeCloseTo(40, 0);
  expect(Math.abs((await coneCenter(page)).y - start.y)).toBeLessThan(1.5);
});

test("keys on a group move what's inside it", async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await page.keyboard.press('Control+g');
  await page.getByRole('button', { name: / Position at frame/ }).click(); // key the group's position
  await frameField(page).fill('30');
  await frameField(page).press('Tab');
  await setField(page, 'Position Y', -10);
  const at30 = await coneCenter(page);
  await frameField(page).fill('0');
  await frameField(page).press('Tab');
  const at0 = await coneCenter(page);
  expect(at0.y - at30.y).toBeGreaterThan(20);
  await expect(page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: /^Group 1 keys on frame/ })).toHaveCount(2);
});

test('the groups are kept between visits', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await page.keyboard.press('Control+g');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('zeditor.autosave') ?? ''))
    .toContain('"group-1"');
  await page.reload();
  await expect(inside(page, 'Group 1').getByRole('button', { name: /^Cone 1/ })).toBeVisible();
});
