import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { field, fileMenu, inspector, openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

const UNDONE = "That change couldn't be drawn, so it was undone.";

/** Makes drawing (or the Inspector) fail on purpose, through the test build's hooks (src/state/testHooks.ts). */
async function breakOn(page: Page, hooks: { breakDrawOf?: string; breakInspectorOf?: string }) {
  await page.evaluate((h) => {
    (window as { __zeditorTest?: object }).__zeditorTest = h;
  }, hooks);
}

async function rename(page: Page, from: string, to: string) {
  await treeItem(page, from).dblclick();
  const name = page.getByRole('textbox', { name: 'Shape name' });
  await name.fill(to);
  await name.press('Enter');
}

const autosave = (page: Page) => page.evaluate(() => localStorage.getItem('zeditor.autosave') ?? '');

test("a change that can't be drawn is undone, the editor says so, and it's never autosaved", async ({ page }) => {
  await breakOn(page, { breakDrawOf: 'Break me' });
  await rename(page, 'Cone 1', 'Break me');
  await expect(page.getByRole('alert')).toContainText(UNDONE);
  await expect(treeItem(page, 'Cone 1')).toBeVisible();
  await expect(treeItem(page, 'Break me')).toHaveCount(0);

  // Still works: the next change draws and is saved.
  await rename(page, 'Cone 1', 'Cone A');
  await expect(treeItem(page, 'Cone A')).toBeVisible();
  await expect.poll(() => autosave(page)).toContain('Cone A');
  expect(await autosave(page)).not.toContain('Break me');
  // Undo goes back past it, not to the change that failed.
  await page.keyboard.press('Control+z');
  await expect(treeItem(page, 'Cone 1')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(treeItem(page, 'Cone A')).toBeVisible();
});

test("opening a scene that trips up the drawing goes back to the scene you had", async ({ page }) => {
  // The file reader refuses what it knows zdog can't draw, so the drawing is made to fail on purpose.
  await breakOn(page, { breakDrawOf: 'Nothing' });
  const file = {
    version: 4,
    settings: { background: '#ffffff' },
    shapes: [{ id: 'shape-1', name: 'Nothing', type: 'Box' }],
  };
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Open…');
  await (await chooser).setFiles({ name: 'broken.zeditor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole('alert')).toContainText(UNDONE);
  await expect(treeItem(page, 'Cone 1')).toBeVisible();
  await expect(treeItem(page, 'Nothing')).toHaveCount(0);
  await expect(page.locator('svg.scene [data-shape-id="cone-1"]').first()).toBeAttached();
});

test('a panel that fails shows a short note with Try again, and the rest of the editor keeps working', async ({ page }) => {
  await breakOn(page, { breakInspectorOf: 'Cone 1' });
  await treeItem(page, 'Cone 1').click();
  await expect(inspector(page).getByRole('alert')).toContainText('The Inspector hit a snag');
  // The scene tree and the viewport still work.
  await treeItem(page, 'Box 1').click();
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');

  await breakOn(page, {});
  await inspector(page).getByRole('button', { name: 'Try again' }).click();
  await expect(field(page, 'Position X')).toBeVisible();
});

test("a saved scene that can't be drawn at start-up offers a copy and a fresh start", async ({ page }) => {
  await rename(page, 'Cone 1', 'Break me');
  await expect.poll(() => autosave(page)).toContain('Break me');

  // From now on (every page load), drawing "Break me" fails.
  await page.addInitScript(() => {
    (window as { __zeditorTest?: object }).__zeditorTest = { breakDrawOf: 'Break me' };
  });
  await page.reload();
  const dialog = page.getByRole('dialog', { name: "This scene couldn't be drawn" });
  await expect(dialog).toBeVisible();

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download a copy' }).click();
  const copy = await download;
  expect(copy.suggestedFilename()).toBe('recovered-scene.zeditor.json');
  expect(await readFile(await copy.path(), 'utf8')).toContain('Break me');

  await dialog.getByRole('button', { name: 'Start a new scene' }).click();
  await expect(treeItem(page, 'Cone 1')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('zeditor.autosave.backup') ?? '')).toContain('Break me');
});
