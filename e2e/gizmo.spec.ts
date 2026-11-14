import { expect, test } from '@playwright/test';
import {
  arrow,
  arrowGrip,
  centerOf,
  drag,
  field,
  gizmoCenter,
  grabbable,
  openEditorForEachTest,
  orbit,
  ring,
  shapeBounds,
  treeItem,
} from './helpers';

openEditorForEachTest(test);

test('the gizmo sits on the selected shape from any camera angle and zoom', async ({ page }) => {
  await expect(page.locator('svg.gizmo')).toHaveCount(0);

  // A circle's outline is centered on its position from any angle.
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Circle' }).click();
  await field(page, 'Position X').fill('3');
  await field(page, 'Position Y').fill('-2');
  await field(page, 'Position Z').fill('5');
  await field(page, 'Position Z').press('Tab');

  const expectOnDot = async () => {
    await expect
      .poll(async () => {
        const dot = centerOf((await shapeBounds(page, 'ellipse-2'))!);
        const center = await gizmoCenter(page);
        return Math.hypot(dot.x - center.x, dot.y - center.y);
      })
      .toBeLessThan(1);
  };
  await expectOnDot();
  await orbit(page, 70, -40);
  await expect(page.locator('svg.gizmo')).toBeVisible();
  await expectOnDot();
  await page.mouse.wheel(0, -400);
  await expectOnDot();
});

// 2020 bug: gizmos piled up, or weren't removed, as the selection changed.
test('there is exactly one gizmo, on the selected shape, and none without a selection', async ({ page }) => {
  for (const name of ['Box 1', 'Cone 1', 'Circle 1', 'Box 1']) {
    await treeItem(page, name).click();
    await expect(page.locator('svg.gizmo')).toHaveCount(1);
    await expect(page.locator('.gizmo [data-handle]')).toHaveCount(6);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('svg.gizmo')).toHaveCount(0);
});

test('dragging an arrow moves the shape along its axis, as one undo step', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const before = (await shapeBounds(page, 'cone-1'))!;

  const { from, to } = await arrow(page, 'x');
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 20, y: grip.y + 9 }, { x: grip.x + 40, y: grip.y + 9 }]);
  // Only the part of the drag along the arrow counts, and the shape follows the pointer.
  await expect.poll(async () => (await shapeBounds(page, 'cone-1'))!.left - before.left).toBeCloseTo(40, 0);
  expect((await shapeBounds(page, 'cone-1'))!.top).toBeCloseTo(before.top, 1);
  expect(Number(await field(page, 'Position X').inputValue())).toBeGreaterThan(12);
  await expect(field(page, 'Position Y')).toHaveValue('-4');
  await expect(field(page, 'Position Z')).toHaveValue('4');
  expect(to.x).toBeGreaterThan(from.x);

  await page.keyboard.press('Control+z');
  await expect(field(page, 'Position X')).toHaveValue('12');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('arrows work from a turned camera, and Shift snaps to whole units', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  // From the front, the Z arrow points at you and is switched off.
  await expect(page.locator('.gizmo [data-handle="move-z"]')).toHaveClass(/is-off/);

  await orbit(page, 80, -50);
  await expect(page.locator('.gizmo [data-handle="move-z"]')).not.toHaveClass(/is-off/);
  const { from, to } = await arrow(page, 'z');
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const before = centerOf((await shapeBounds(page, 'box-1'))!);

  const grip = await arrowGrip(page, 'z');
  await drag(page, [grip, { x: grip.x + along.x * 30, y: grip.y + along.y * 30 }]);
  await expect
    .poll(async () => {
      const after = centerOf((await shapeBounds(page, 'box-1'))!);
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeCloseTo(30, 0);
  await expect(field(page, 'Position X')).toHaveValue('4');
  await expect(field(page, 'Position Y')).toHaveValue('4');
  expect(Number(await field(page, 'Position Z').inputValue())).toBeGreaterThan(-4);

  const nextGrip = await arrowGrip(page, 'z');
  await drag(page, [nextGrip, { x: nextGrip.x + along.x * 37, y: nextGrip.y + along.y * 37 }], { shift: true });
  const z = Number(await field(page, 'Position Z').inputValue());
  expect(Number.isInteger(z)).toBe(true);
});

test('dragging a ring turns the shape; Shift snaps to 15°', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  const center = await gizmoCenter(page);
  const points = await ring(page, 'z');
  const rightmost = points.reduce((best, p) => (p.x > best.x ? p : best));
  const radius = rightmost.x - center.x;

  // A quarter turn clockwise on screen, starting between the arrows.
  const arc = [30, 60, 90, 118].map((deg) => ({
    x: center.x + radius * Math.cos((deg * Math.PI) / 180),
    y: center.y + radius * Math.sin((deg * Math.PI) / 180),
  }));
  expect(await grabbable(page, 'rotate-z', [arc[0]])).toEqual(arc[0]);
  await drag(page, arc, { shift: true });
  await expect(field(page, 'Rotation Z')).toHaveValue('90');
  await expect(field(page, 'Rotation X')).toHaveValue('0');
  await expect(field(page, 'Rotation Y')).toHaveValue('0');

  await page.keyboard.press('Control+z');
  await expect(field(page, 'Rotation Z')).toHaveValue('0');

  // After turning the camera, the X ring can be dragged and changes only Rotation X.
  await orbit(page, 60, -60);
  await expect(page.locator('.gizmo [data-handle="rotate-x"]')).not.toHaveClass(/is-off/);
  const xRing = await ring(page, 'x');
  const xCenter = await gizmoCenter(page);
  const start = await grabbable(page, 'rotate-x', [8, 24, 40, 56, 16, 48].map((i) => xRing[i]));
  const startAngle = Math.atan2(start.y - xCenter.y, start.x - xCenter.x);
  const r = Math.hypot(start.x - xCenter.x, start.y - xCenter.y);
  const sweep = [0, 0.3, 0.6, 0.9].map((t) => ({
    x: xCenter.x + r * Math.cos(startAngle + t),
    y: xCenter.y + r * Math.sin(startAngle + t),
  }));
  await drag(page, sweep);
  expect(Math.abs(Number(await field(page, 'Rotation X').inputValue()))).toBeGreaterThan(20);
  await expect(field(page, 'Rotation Y')).toHaveValue('0');
  await expect(field(page, 'Rotation Z')).toHaveValue('0');
});

test('the wheel zooms, Reset view goes back, and undo leaves the camera alone', async ({ page }) => {
  const resetView = page.getByRole('button', { name: 'Reset view' });
  await expect(resetView).toBeDisabled();
  const before = (await shapeBounds(page, 'cone-1'))!;
  const viewport = (await page.locator('svg.scene').boundingBox())!;

  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => {
      const zoomed = (await shapeBounds(page, 'cone-1'))!;
      return zoomed.right - zoomed.left;
    })
    .toBeGreaterThan((before.right - before.left) * 1.3);

  // Editing and undoing doesn't move the camera.
  await treeItem(page, 'Box 1').click();
  await field(page, 'Width').fill('8');
  await field(page, 'Width').press('Tab');
  const zoomedCone = await shapeBounds(page, 'cone-1');
  await page.keyboard.press('Control+z');
  await expect(field(page, 'Width')).toHaveValue('5');
  expect(await shapeBounds(page, 'cone-1')).toEqual(zoomedCone);

  await resetView.click();
  await expect.poll(() => shapeBounds(page, 'cone-1')).toEqual(before);
  await expect(resetView).toBeDisabled();
});
