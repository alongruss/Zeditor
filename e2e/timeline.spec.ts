import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, field, fileMenu, openEditorForEachTest, shapeBounds, treeItem } from './helpers';

openEditorForEachTest(test);

const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
/** Cone 1's frames with keys, as the timeline panel shows them. */
const coneKeys = (page: Page) =>
  page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: /^Cone 1 keys on frame/ });
const keyButton = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(` ${label} at frame`) });

/** Moves the playhead by typing in the Frame field. */
async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Tab');
  await expect(frameField(page)).toHaveValue(String(frame));
}

/** Cone 1's X keyed at 12 on frame 0 and 20 on frame 60. */
async function animateConeX(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/^Animate Position at frame 0/);
  await keyButton(page, 'Position').click();
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/^Remove key for Position at frame 0/);

  await goToFrame(page, 60);
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/no key on this frame/);
  // Editing an animated value keys it on the current frame.
  await field(page, 'Position X').fill('20');
  await field(page, 'Position X').press('Tab');
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/some parts keyed on this frame/);
}

test('keys at two frames tween the value in between, and the ruler shows them', async ({ page }) => {
  await animateConeX(page);
  await expect(coneKeys(page)).toHaveCount(2);

  // Halfway, ease in-out is exactly halfway: 16.
  await goToFrame(page, 30);
  await expect(field(page, 'Position X')).toHaveValue('16');
  // Y and Z only got a key on frame 0, so they hold their value.
  await expect(field(page, 'Position Y')).toHaveValue('-4');
  // A keyed field is tinted; one between keys is tinted differently.
  await expect(page.locator('label.field-number', { has: field(page, 'Position X') })).toHaveClass(/anim-track/);
  await goToFrame(page, 60);
  await expect(page.locator('label.field-number', { has: field(page, 'Position X') })).toHaveClass(/anim-key/);

  // The ruler moves the playhead too.
  const ruler = (await page.getByRole('slider', { name: 'Playhead' }).boundingBox())!;
  await page.mouse.click(ruler.x + 1, ruler.y + ruler.height / 2);
  await expect(frameField(page)).toHaveValue('0');
  await expect(field(page, 'Position X')).toHaveValue('12');
});

test('Play moves the shape, and Pause stops on the frame it reached', async ({ page }) => {
  await animateConeX(page);
  await goToFrame(page, 0);
  await afterRedraw(page);
  const start = (await shapeBounds(page, 'cone-1'))!;

  await page.getByRole('button', { name: 'Play' }).click();
  // While playing, the shape moves (X goes from 12 towards 20).
  await expect.poll(async () => (await shapeBounds(page, 'cone-1'))?.left ?? start.left).toBeGreaterThan(start.left + 5);
  await page.getByRole('button', { name: 'Pause' }).click();
  // Wherever it stopped (on a slow machine the loop may have wrapped around), it stays there.
  const stoppedAt = await frameField(page).inputValue();
  await page.waitForTimeout(300);
  await expect(frameField(page)).toHaveValue(stoppedAt);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('Undo removes a key, and a reload keeps the animation', async ({ page }) => {
  await animateConeX(page);
  await page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: /^Cone 1/ }).focus();
  await page.keyboard.press('Control+z'); // the edit that keyed frame 60
  await expect(field(page, 'Position X')).toHaveValue('12');
  await expect(coneKeys(page)).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(coneKeys(page)).toHaveCount(2);

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('zeditor.autosave') ?? ''))
    .toContain('"translate.x"');
  await page.reload();
  await treeItem(page, 'Cone 1').click();
  await goToFrame(page, 30);
  await expect(field(page, 'Position X')).toHaveValue('16');
});

test('fps and length are scene settings that can be undone', async ({ page }) => {
  const fps = page.getByLabel('Frames per second', { exact: true });
  const length = page.getByLabel('Length in frames', { exact: true });
  await expect(fps).toHaveValue('30');
  await expect(length).toHaveValue('90');
  await length.fill('48');
  await length.press('Tab');
  await expect(page.getByRole('slider', { name: 'Playhead' })).toHaveAttribute('aria-valuemax', '47');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(length).toHaveValue('90');
});

test('a version 1 file (made before animation) still opens', async ({ page }) => {
  const v1 = JSON.stringify({
    version: 1,
    settings: { background: '#ffffff' },
    shapes: [{ id: 'box-1', name: 'Old box', type: 'Box', translate: { x: 1, y: 2, z: 3 } }],
  });
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Open…');
  await (await chooser).setFiles({ name: 'old.zeditor.json', mimeType: 'application/json', buffer: Buffer.from(v1) });
  await treeItem(page, 'Old box').click();
  await expect(field(page, 'Position Z')).toHaveValue('3');
  await expect(page.getByLabel('Frames per second', { exact: true })).toHaveValue('30');
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/^Animate Position/);
});
