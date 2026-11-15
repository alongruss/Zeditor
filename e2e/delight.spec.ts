import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { afterRedraw, field, fileMenu, openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

const FIRST_KEY_TIP = 'Move to another frame and change something to animate it.';
const keyButton = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(` ${label} at frame`) });
const frameField = (page: Page) => page.getByLabel('Frame', { exact: true });
const card = (page: Page) => page.getByRole('region', { name: 'Export done' });
const shapeRows = (page: Page) => page.getByRole('list', { name: 'Shapes' }).getByRole('listitem');

async function goToFrame(page: Page, frame: number) {
  await frameField(page).fill(String(frame));
  await frameField(page).press('Tab');
  await expect(frameField(page)).toHaveValue(String(frame));
}

/** Cone 1's X keyed on frames 0 and 60. */
async function animateConeX(page: Page) {
  await treeItem(page, 'Cone 1').click();
  await keyButton(page, 'Position').click();
  await goToFrame(page, 60);
  await field(page, 'Position X').fill('20');
  await field(page, 'Position X').press('Tab');
}

async function exportLottie(page: Page) {
  await fileMenu(page, 'Export Lottie…');
  const dialog = page.getByRole('dialog', { name: 'Export Lottie' });
  await expect(dialog.getByText(/^About \d+ KB\.$/)).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  await download;
  await expect(dialog).toBeHidden();
}

test('an empty scene asks what you will make, with three ways to begin', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.accept());
  await fileMenu(page, 'New scene');
  await expect(page.getByRole('heading', { name: 'What will you make today?' })).toBeVisible();
  // The Scene panel keeps its own sentence.
  await expect(page.getByText('No shapes yet. Use Add to create one.')).toBeVisible();

  await page.getByRole('button', { name: /^Add a shape/ }).click();
  await expect(page.getByRole('menu', { name: 'Add' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Start from the sample scene/ }).click();
  await expect(shapeRows(page)).toHaveCount(9);
  await expect(page.getByRole('heading', { name: 'What will you make today?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What will you make today?' })).toBeVisible();
});

test('after a Lottie export, a calm card shows what was made; Done, Escape or an edit closes it', async ({ page }) => {
  await exportLottie(page);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('90frames');
  await expect(card(page)).toContainText('3.0seconds');
  await expect(card(page)).toContainText(/\d+KB/);
  // It takes no focus and isn't a second live region (the "Saved …" notice is).
  expect(await card(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await expect(page.getByRole('status')).toContainText('Saved scene.lottie.json');

  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);

  await exportLottie(page);
  await card(page).getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toHaveCount(0);

  await exportLottie(page);
  await treeItem(page, 'Cone 1').click();
  await expect(card(page)).toBeVisible(); // selecting isn't an edit
  await page.keyboard.press('Delete');
  await expect(card(page)).toHaveCount(0);
});

test('the export preview loops, or holds still when less motion is asked for', async ({ page }) => {
  await animateConeX(page);
  await exportLottie(page);
  await expect(card(page).locator('canvas.export-preview')).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await exportLottie(page);
  await expect(card(page).locator('canvas.export-preview')).toHaveAttribute('data-playing', 'false');
});

test('the first key opens the timeline and says what to do next, once', async ({ page }) => {
  await page.getByRole('button', { name: 'Timeline ▾' }).click(); // close it first
  await expect(page.getByRole('region', { name: 'Timeline' })).toHaveCount(0);

  await treeItem(page, 'Cone 1').click();
  await keyButton(page, 'Position').click();
  await expect(page.getByRole('status')).toContainText(FIRST_KEY_TIP);
  await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();

  // It's remembered in this browser, so a new first key (after taking the key
  // away, which leaves the scene not animated) doesn't bring it back.
  expect(await page.evaluate(() => localStorage.getItem('zeditor.firstKeyTipShown'))).toBe('1');
  await keyButton(page, 'Position').click();
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/^Animate Position/);
  await keyButton(page, 'Position').click();
  await expect(keyButton(page, 'Position')).toHaveAccessibleName(/^Remove key for Position/);
  await afterRedraw(page);
  expect(await page.getByRole('status').textContent()).not.toContain(FIRST_KEY_TIP);
});
