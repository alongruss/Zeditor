import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { recordFrame, type DrawOp } from '../src/render/drawOps';
import { viewFromCamera } from '../src/render/view';
import { addShape, createCamera, createShape, emptyScene } from '../src/model/scene';
import { afterRedraw, field, fileMenu, inspector, openEditorForEachTest, orbit, treeItem } from './helpers';

openEditorForEachTest(test);

const cameraItem = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Cameras' }).getByRole('button', { name: new RegExp(`^${name}\\b`) });
const viewMenu = (page: Page) => page.getByRole('combobox', { name: 'View' });
const letterbox = (page: Page) => page.getByRole('img', { name: /^Looking through / });
const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
const keyButton = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(` ${label} at frame`) });
const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });

async function addCamera(page: Page) {
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Camera' }).click();
}

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Tab');
  await expect(frameField(page)).toHaveValue(String(frame));
}

/** Types into an Inspector number field and leaves it. */
async function setField(page: Page, label: string, value: number) {
  await field(page, label).fill(String(value));
  await field(page, label).press('Tab');
  await expect(field(page, label)).toHaveValue(String(value));
}

/** Scrolls the wheel over the middle of the viewport, `times` notches in one quick burst. */
async function wheel(page: Page, deltaY: number, times: number) {
  const box = (await page.locator('svg.scene').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < times; i++) await page.mouse.wheel(0, deltaY);
  await afterRedraw(page);
}

test('Add > Camera films the free view; it is listed under Cameras and drawn as a frame', async ({ page }) => {
  await addCamera(page);
  await expect(cameraItem(page, 'Camera 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector(page).getByText('Camera', { exact: true })).toBeVisible();
  const viewport = (await page.locator('svg.scene').boundingBox())!;
  await expect(field(page, 'Width')).toHaveValue(String(Math.round(viewport.width)));
  await expect(field(page, 'Height')).toHaveValue(String(Math.round(viewport.height)));
  await expect(field(page, 'Angle Z')).toHaveValue('0');

  // Zoom the free view out and turn it: the camera's frame shows inside the viewport, at an angle.
  await wheel(page, 120, 4);
  await orbit(page, 70, -30);
  const frame = page.locator('.camera-frame[data-camera-id="camera-1"]');
  await expect(frame).toHaveClass(/is-selected/);

  // Clicking the frame selects its camera.
  await treeItem(page, 'Cone 1').click();
  await expect(frame).not.toHaveClass(/is-selected/);
  await frame.locator('text.camera-frame-label').click();
  await expect(cameraItem(page, 'Camera 1')).toHaveAttribute('aria-pressed', 'true');

  // Rename and duplicate work on cameras too.
  await cameraItem(page, 'Camera 1').dblclick();
  await page.getByRole('textbox', { name: 'Camera name' }).fill('Hero');
  await page.getByRole('textbox', { name: 'Camera name' }).press('Enter');
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(cameraItem(page, 'Camera 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.camera-frame')).toHaveCount(2);
  await expect(viewMenu(page).getByRole('option')).toHaveText(['Free view', 'Hero', 'Camera 2']);
});

test('looking through a camera letterboxes it; dragging and the wheel change it, one undo step each', async ({ page }) => {
  await addCamera(page);
  await setField(page, 'Width', 400);
  await setField(page, 'Height', 300);
  await viewMenu(page).selectOption({ label: 'Camera 1' });
  await expect(letterbox(page)).toHaveAccessibleName('Looking through Camera 1');
  await expect(letterbox(page)).toContainText('Camera 1 · 400×300');
  const box = (await letterbox(page).boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(400 / 300, 1);
  await expect(page.getByRole('button', { name: 'Back to free view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeDisabled();
  // The camera's own frame isn't drawn while looking through it.
  await expect(page.locator('.camera-frames')).toHaveCount(0);

  const angleY = await field(page, 'Angle Y').inputValue();
  await orbit(page, 60, 0);
  await expect(field(page, 'Angle Y')).not.toHaveValue(angleY);
  await undoButton(page).click();
  await expect(field(page, 'Angle Y')).toHaveValue(angleY);

  await wheel(page, -100, 3); // zoom in: the camera shows less
  const span = Number(await field(page, 'View span').inputValue());
  expect(span).toBeLessThan(32);
  await undoButton(page).click();
  await expect(field(page, 'View span')).toHaveValue('32');

  await page.getByRole('button', { name: 'Back to free view' }).click();
  await expect(letterbox(page)).toHaveCount(0);
  await expect(viewMenu(page)).toHaveValue('');

  // Deleting the camera being looked through goes back to the free view, for good:
  // a new camera that gets the same id isn't looked through.
  await viewMenu(page).selectOption({ label: 'Camera 1' });
  await expect(letterbox(page)).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(letterbox(page)).toHaveCount(0);
  await addCamera(page);
  await expect(cameraItem(page, 'Camera 1')).toBeVisible();
  await expect(letterbox(page)).toHaveCount(0);
  await expect(viewMenu(page)).toHaveValue('');
});

test('an animated camera: orbiting on another frame keys it, and the timeline shows it', async ({ page }) => {
  await addCamera(page);
  await page.getByRole('button', { name: 'Look through' }).click();
  await keyButton(page, 'Angle').click();
  await expect(keyButton(page, 'Angle')).toHaveAccessibleName(/^Remove key for Angle at frame 0/);
  const start = Number(await field(page, 'Angle Y').inputValue());

  await goToFrame(page, 30);
  await orbit(page, -80, 0);
  const end = Number(await field(page, 'Angle Y').inputValue());
  expect(end).not.toBe(start);
  const keys = page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: /^Camera 1 keys on frame/ });
  await expect(keys).toHaveCount(2);

  // Halfway, ease in-out is exactly halfway.
  await goToFrame(page, 15);
  await expect(field(page, 'Angle Y')).toHaveValue(String(Math.round(((start + end) / 2) * 100) / 100));
});

/** The middle of everything a frame draws. */
function middleOf(ops: readonly DrawOp[]) {
  const points = ops.flatMap((op) => op.subpaths.flatMap((s) => [s.start, ...s.segments.map((segment) => segment.to)]));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

test('looking through a camera shows just what it exports', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.accept());
  await fileMenu(page, 'New scene');
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Circle' }).click();
  await setField(page, 'Position X', 5);
  await setField(page, 'Position Y', -3);
  await setField(page, 'Position Z', 2);

  await addCamera(page);
  const camera = {
    rotate: { x: -20, y: 35, z: 15 },
    target: { x: 1, y: 0, z: 0 },
    viewSpan: 20,
    width: 400,
    height: 300,
  };
  await setField(page, 'Angle X', camera.rotate.x);
  await setField(page, 'Angle Y', camera.rotate.y);
  await setField(page, 'Angle Z', camera.rotate.z);
  await setField(page, 'Target X', camera.target.x);
  await setField(page, 'View span', camera.viewSpan);
  await setField(page, 'Width', camera.width);
  await setField(page, 'Height', camera.height);
  await page.getByRole('button', { name: 'Look through' }).click();
  await expect(letterbox(page)).toBeVisible();
  await afterRedraw(page);

  // Where the circle is in the letterboxed picture, as a fraction of its size...
  const picture = (await letterbox(page).boundingBox())!;
  const shown = await page.locator('svg.scene [data-shape-id]').first().evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  });
  // ...is where the camera's own picture has it.
  const circle = { ...createShape(emptyScene(), 'Ellipse'), translate: { x: 5, y: -3, z: 2 } };
  const exported = middleOf(recordFrame(addShape(emptyScene(), circle), viewFromCamera({ ...createCamera(emptyScene(), camera) })));
  expect((shown.x - picture.x) / picture.width).toBeCloseTo(exported.x / camera.width, 2);
  expect((shown.y - picture.y) / picture.height).toBeCloseTo(exported.y / camera.height, 2);
  // Off-center, so a wrong target or roll would show.
  expect(Math.hypot(exported.x / camera.width - 0.5, exported.y / camera.height - 0.5)).toBeGreaterThan(0.05);
});
