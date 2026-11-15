import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { field, openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' });
const key = (page: Page, name: RegExp | string) => timeline(page).getByRole('button', { name });
const selectedKeys = (page: Page) => timeline(page).locator('.tl-key[aria-pressed="true"]');

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Tab');
  await expect(frameField(page)).toHaveValue(String(frame));
}

/** Cone 1's Position keyed on frame 0 (X 12) and its X on frame 60 (X 20); its rows shown. */
async function animateConeX(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await page.getByRole('button', { name: /^Animate Position at frame 0/ }).click();
  await goToFrame(page, 60);
  await field(page, 'Position X').fill('20');
  await field(page, 'Position X').press('Tab');
  await timeline(page).getByRole('button', { name: 'Show Cone 1 properties' }).click();
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toBeVisible();
}

/** Screen pixels per frame on the timeline. */
async function pixelsPerFrame(page: Page): Promise<number> {
  const a = (await key(page, /^Cone 1 Position X key on frame 0/).boundingBox())!;
  const b = (await key(page, /^Cone 1 Position X key on frame 60/).boundingBox())!;
  return (b.x - a.x) / 60;
}

async function dragKey(page: Page, name: RegExp, frames: number) {
  const box = (await key(page, name).boundingBox())!;
  const step = await pixelsPerFrame(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (frames * step) / 2, y, { steps: 4 });
  await page.mouse.move(x + frames * step, y, { steps: 4 });
  await page.mouse.up();
}

test('dragging a key moves it in time, as one undo step', async ({ page }) => {
  await animateConeX(page);
  await dragKey(page, /^Cone 1 Position X key on frame 60/, -20);
  await expect(key(page, /^Cone 1 Position X key on frame 40/)).toBeVisible();
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toHaveCount(0);
  await goToFrame(page, 40);
  await expect(field(page, 'Position X')).toHaveValue('20');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toBeVisible();
  // The moved key no longer exists, so it is no longer selected: Delete deletes the shape again.
  await expect(selectedKeys(page)).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Delete');
  await expect(treeItem(page, 'Cone 1')).toHaveCount(0);
});

test('the easing of selected keys can be changed, as one undo step', async ({ page }) => {
  await animateConeX(page);
  await key(page, /^Cone 1 Position X key on frame 0/).click();
  await expect(selectedKeys(page)).toHaveCount(1);
  const easing = timeline(page).getByLabel('Easing of selected keys');
  await expect(easing).toHaveValue('easeInOut');

  await easing.selectOption('hold');
  await goToFrame(page, 30);
  await expect(field(page, 'Position X')).toHaveValue('12'); // holds until frame 60
  await expect(key(page, /^Cone 1 Position X key on frame 0, Hold/)).toBeVisible();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(field(page, 'Position X')).toHaveValue('16');

  // The right-click menu does the same.
  await key(page, /^Cone 1 Position X key on frame 0/).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Key actions' }).getByRole('menuitemradio', { name: 'Linear' }).click();
  await expect(key(page, /^Cone 1 Position X key on frame 0, Linear/)).toBeVisible();
});

test('Shift-click and a marquee select several keys; Delete deletes them', async ({ page }) => {
  await animateConeX(page);
  await key(page, /^Cone 1 Position X key on frame 0/).click();
  await key(page, /^Cone 1 Position Y key on frame 0/).click({ modifiers: ['Shift'] });
  await expect(selectedKeys(page)).toHaveCount(2);
  await key(page, /^Cone 1 Position Y key on frame 0/).click({ modifiers: ['Shift'] });
  await expect(selectedKeys(page)).toHaveCount(1);

  // Drag a box around both frame-60 keys (the Cone row's summary and Position X).
  const summary = (await key(page, 'Cone 1 keys on frame 60').boundingBox())!;
  const positionX = (await key(page, /^Cone 1 Position X key on frame 60/).boundingBox())!;
  await page.mouse.move(summary.x - 12, summary.y - 6);
  await page.mouse.down();
  await page.mouse.move(positionX.x + 20, positionX.y + positionX.height + 4, { steps: 6 });
  await page.mouse.up();
  await expect(selectedKeys(page)).toHaveCount(2);

  await page.keyboard.press('Delete');
  await expect(key(page, /on frame 60/)).toHaveCount(0);
  await expect(treeItem(page, 'Cone 1')).toBeVisible(); // the keys went, not the shape
  await page.keyboard.press('Control+z');
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toBeVisible();
});

test('Space plays and pauses; arrows, Home and End move the playhead', async ({ page }) => {
  await animateConeX(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus out of the fields
  await page.keyboard.press('Home');
  await expect(frameField(page)).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frameField(page)).toHaveValue('11');
  await page.keyboard.press('End');
  await expect(frameField(page)).toHaveValue('89');

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('Space toggles playback once, even when a button has focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Play' }).click(); // the Play button now has focus
  await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible(); // still paused
});

test('changing fps asks whether to keep the timing, and can be undone', async ({ page }) => {
  await animateConeX(page);
  const fps = page.getByLabel('Frames per second', { exact: true });
  await fps.selectOption('60');
  const dialog = page.getByRole('dialog', { name: 'Change from 30 to 60 fps?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep timing' }).click();
  await expect(dialog).toBeHidden();
  await expect(fps).toHaveValue('60');
  await expect(page.getByLabel('Length in frames', { exact: true })).toHaveValue('180');
  await expect(key(page, /^Cone 1 Position X key on frame 120/)).toBeVisible();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(fps).toHaveValue('30');
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toBeVisible();

  await fps.selectOption('24');
  await page.getByRole('dialog', { name: 'Change from 30 to 24 fps?' }).getByRole('button', { name: 'Keep frames' }).click();
  await expect(fps).toHaveValue('24');
  await expect(key(page, /^Cone 1 Position X key on frame 60/)).toBeVisible();
});

test('the timeline can be hidden and shown again', async ({ page }) => {
  await expect(timeline(page)).toBeVisible();
  await expect(timeline(page)).toContainText('Nothing is animated yet');
  await page.getByRole('button', { name: /^Timeline/ }).click();
  await expect(timeline(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^Timeline/ }).click();
  await expect(timeline(page)).toBeVisible();
});
