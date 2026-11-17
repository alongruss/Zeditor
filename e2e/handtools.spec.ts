import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  afterRedraw,
  arrowGrip,
  centerOf,
  drag,
  field,
  gizmoCenter,
  grabbable,
  inspector,
  openEditorForEachTest,
  ring,
  shapeBounds,
  treeItem,
} from './helpers';

openEditorForEachTest(test);

const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' });
const key = (page: Page, name: RegExp | string) => timeline(page).getByRole('button', { name });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' });
const ctrl = process.platform === 'darwin' ? 'Meta' : 'Control';

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Tab');
  await expect(frameField(page)).toHaveValue(String(frame));
}

async function setField(page: Page, label: string, value: number) {
  await field(page, label).fill(String(value));
  await field(page, label).press('Tab');
  await expect(field(page, label)).toHaveValue(String(value));
}

async function center(page: Page, id: string) {
  await afterRedraw(page);
  return centerOf(await shapeBounds(page, id))!;
}

/** Cone 1's Position keyed on frame 0, and its X on frame 60 (X 20). */
async function animateConeX(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await page.getByRole('button', { name: /^Animate Position at frame 0/ }).click();
  await goToFrame(page, 60);
  await setField(page, 'Position X', 20);
  await expect(key(page, /^Cone 1 keys on frame 60/)).toBeVisible();
}

test('Ctrl+C copies keys; Ctrl+V pastes them onto the selected shape on the playhead, as one undo step', async ({ page }) => {
  await animateConeX(page);
  await key(page, /^Cone 1 keys on frame 0/).click();
  await key(page, /^Cone 1 keys on frame 60/).click({ modifiers: ['Shift'] });
  await page.keyboard.press(`${ctrl}+c`);
  await expect(page.getByRole('status')).toContainText('Copied 4 keys');

  await treeItem(page, 'Box 1').click();
  await goToFrame(page, 20);
  await page.keyboard.press(`${ctrl}+v`);
  await expect(key(page, /^Box 1 keys on frame 20/)).toBeVisible();
  await expect(key(page, /^Box 1 keys on frame 80/)).toBeVisible();
  await goToFrame(page, 80);
  await expect(field(page, 'Position X')).toHaveValue('20');
  // Cone 1 is as it was.
  await expect(key(page, /^Cone 1 keys on frame/)).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(key(page, /^Box 1 keys on frame/)).toHaveCount(0);
});

test('right-clicking a row pastes there; keys past the end are left out, with a note', async ({ page }) => {
  await animateConeX(page);
  await key(page, /^Cone 1 keys on frame 0/).click();
  await key(page, /^Cone 1 keys on frame 60/).click({ modifiers: ['Shift'] });
  await page.keyboard.press(`${ctrl}+c`);

  await treeItem(page, 'Box 1').click();
  const lane = timeline(page).locator('.tl-row', { hasText: 'Box 1' }).locator('.tl-lane');
  const zero = (await key(page, /^Cone 1 keys on frame 0/).boundingBox())!;
  const sixty = (await key(page, /^Cone 1 keys on frame 60/).boundingBox())!;
  const laneBox = (await lane.boundingBox())!;
  // Frame 50: 60 frames on is past the end (frame 89).
  await lane.click({ button: 'right', position: { x: zero.x + ((sixty.x - zero.x) * 50) / 60 + zero.width / 2 - laneBox.x, y: laneBox.height / 2 } });
  await page.getByRole('menuitem', { name: 'Paste keys here (Box 1, frame 50)' }).click();
  await expect(key(page, /^Box 1 keys on frame 50/)).toBeVisible();
  await expect(key(page, /^Box 1 keys on frame/)).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('Pasted 3 keys. Left out 1 past the last frame.');
});

test('Ghosts show the selection on the keys before and after the playhead, and hide while playing', async ({ page }) => {
  await animateConeX(page);
  await goToFrame(page, 30);
  const ghosts = page.getByRole('button', { name: 'Ghosts' });
  await ghosts.click();
  await expect(ghosts).toHaveAttribute('aria-pressed', 'true');
  const before = page.locator('svg.ghost-before');
  const after = page.locator('svg.ghost-after');
  await expect(before).toHaveAttribute('data-frame', '0');
  await expect(after).toHaveAttribute('data-frame', '60');
  await expect(before).toBeVisible();
  // Only the selection is ghosted, and it can't be clicked.
  await expect(after.locator('[data-shape-id="cone-1"]').first()).toBeAttached();
  await expect(after.locator('[data-shape-id="box-1"]')).toHaveCount(0);
  await expect(after).toHaveCSS('pointer-events', 'none');
  // The ghost after is where the cone is on frame 60: to the right of where it is now.
  await afterRedraw(page);
  const ghostX = await after.locator('[data-shape-id="cone-1"]').first().evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.left + r.width / 2;
  });
  expect(ghostX).toBeGreaterThan((await center(page, 'cone-1')).x + 5);

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(before).toBeHidden();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(before).toBeVisible();
  await ghosts.click();
  await expect(before).toBeHidden();
  await expect(after).toBeHidden();
});

test("Pivot moves a group's origin and leaves what's inside where it is", async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await page.keyboard.press(`${ctrl}+g`);
  const pivot = toolbar(page).getByRole('button', { name: 'Pivot' });
  await pivot.click();
  await expect(pivot).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('svg.gizmo')).toHaveClass(/is-pivot/);
  await expect(page.locator('.gizmo [data-handle^="rotate-"]')).toHaveCount(0);

  const start = await center(page, 'cone-1');
  const groupX = Number(await field(page, 'Position X').inputValue());
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 20, y: grip.y }, { x: grip.x + 40, y: grip.y }]);
  await expect.poll(async () => Number(await field(page, 'Position X').inputValue())).toBeGreaterThan(groupX + 1);
  const still = await center(page, 'cone-1');
  expect(Math.abs(still.x - start.x)).toBeLessThan(1);
  expect(Math.abs(still.y - start.y)).toBeLessThan(1);

  // Turning the group now swings the cone around the new pivot.
  await pivot.click();
  await setField(page, 'Rotation Z', 90);
  expect(Math.abs((await center(page, 'cone-1')).y - start.y)).toBeGreaterThan(10);

  // One undo step each.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(inspector(page).getByLabel('Position X', { exact: true })).toHaveValue(String(groupX));
});

test("a group that turns over time keeps its pivot, and says why", async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await page.keyboard.press(`${ctrl}+g`);
  await page.getByRole('button', { name: /^Animate Rotation at frame 0/ }).click();
  await toolbar(page).getByRole('button', { name: 'Pivot' }).click();
  const groupX = await field(page, 'Position X').inputValue();
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 40, y: grip.y }]);
  await expect(page.getByRole('status')).toContainText('turns or scales over time');
  await expect(field(page, 'Position X')).toHaveValue(groupX);
});

test('with several selected, a ring turns them together about their middle, as one undo step', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await treeItem(page, 'Cone 1').click({ modifiers: [ctrl] });
  const [box, cone] = [await center(page, 'box-1'), await center(page, 'cone-1')];
  const before = { x: cone.x - box.x, y: cone.y - box.y };

  const middle = await gizmoCenter(page);
  const points = await ring(page, 'z');
  const radius = Math.max(...points.map((p) => p.x)) - middle.x;
  const arc = [30, 60, 90, 120].map((deg) => ({
    x: middle.x + radius * Math.cos((deg * Math.PI) / 180),
    y: middle.y + radius * Math.sin((deg * Math.PI) / 180),
  }));
  await grabbable(page, 'rotate-z', [arc[0]]);
  await drag(page, arc, { shift: true });

  const [box2, cone2] = [await center(page, 'box-1'), await center(page, 'cone-1')];
  const after = { x: cone2.x - box2.x, y: cone2.y - box2.y };
  // A quarter turn: same distance apart, at right angles to before (shape bounds, so roughly).
  expect(Math.hypot(after.x, after.y)).toBeCloseTo(Math.hypot(before.x, before.y), -1);
  expect(Math.abs(before.x * after.x + before.y * after.y) / Math.hypot(before.x, before.y) ** 2).toBeLessThan(0.15);
  await expect(inspector(page)).toContainText('2 selected');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const back = await center(page, 'cone-1');
  expect(Math.abs(back.x - cone.x)).toBeLessThan(1);
  expect(Math.abs(back.y - cone.y)).toBeLessThan(1);
});
