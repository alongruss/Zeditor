import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  arrowGrip,
  drag,
  field,
  fileMenu,
  gizmoCenter,
  grabbable,
  openEditorForEachTest,
  ring,
  treeItem,
} from './helpers';

openEditorForEachTest(test);
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const shapeItems = (page: Page) => page.getByRole('list', { name: 'Shapes' }).getByRole('listitem');

/** Runs `action`, and returns the name and text of the file it downloads. */
async function downloaded(page: Page, action: () => Promise<void>): Promise<{ name: string; text: string }> {
  const download = page.waitForEvent('download');
  await action();
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}

/** Opens `text` as if the user picked a file called `name` in the Open dialog. */
async function openFile(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Open…');
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

/** Waits until the autosave has caught up with a change. */
async function autosaved(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zeditor.autosave') ?? '')).toContain(text);
}

test('Save downloads the scene, and Open brings it back (undoably)', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  await field(page, 'Position X').fill('3');
  await field(page, 'Position X').press('Tab');

  const saved = await downloaded(page, () => fileMenu(page, 'Save'));
  expect(saved.name).toBe('scene.zeditor.json');
  const data = JSON.parse(saved.text);
  expect(data.version).toBe(1);
  expect(data.shapes).toHaveLength(9);
  expect(data.shapes.find((s: { id: string }) => s.id === 'cone-1').translate.x).toBe(3);
  await expect(page.getByRole('status')).toContainText('Saved scene.zeditor.json');

  page.once('dialog', (dialog) => dialog.accept());
  await fileMenu(page, 'New scene');
  await expect(shapeItems(page)).toHaveCount(0);

  await openFile(page, 'crate.zeditor.json', saved.text);
  await expect(shapeItems(page)).toHaveCount(9);
  await treeItem(page, 'Cone 1').click();
  await expect(field(page, 'Position X')).toHaveValue('3');
  await expect(page.getByRole('status')).toContainText('Opened crate.zeditor.json');

  // Opening is one undo step; Save now uses the opened file's name.
  await page.keyboard.press('Control+z');
  await expect(shapeItems(page)).toHaveCount(0);
  const again = await downloaded(page, () => page.keyboard.press('Control+s'));
  expect(again.name).toBe('crate.zeditor.json');
});

test('a file that is not a scene is refused with a message, and nothing changes', async ({ page }) => {
  await openFile(page, 'notes.json', '{"hello": "world"}');
  await expect(page.getByRole('alert')).toContainText("Couldn't open notes.json. This isn't a Zeditor scene file.");
  await expect(shapeItems(page)).toHaveCount(9);

  await openFile(page, 'future.zeditor.json', '{"version": 9, "shapes": []}');
  await expect(page.getByRole('alert')).toContainText('newer version of Zeditor');
  await expect(shapeItems(page)).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('a reload keeps your work, but not the undo history or the camera', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await field(page, 'Width').fill('9');
  await field(page, 'Width').press('Tab');
  await autosaved(page, '"width": 9');

  await page.reload();
  await treeItem(page, 'Box 1').click();
  await expect(field(page, 'Width')).toHaveValue('9');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeDisabled();

  // An empty scene is kept too, rather than the starter scene coming back.
  page.once('dialog', (dialog) => dialog.accept());
  await fileMenu(page, 'New scene');
  await autosaved(page, '"shapes": []');
  await page.reload();
  await expect(page.getByText('No shapes yet. Use Add to create one.')).toBeVisible();
});

test('Export Zdog JS copies and downloads a script that draws the scene', async ({ page, context }) => {
  const exported = await downloaded(page, () => fileMenu(page, 'Export Zdog JS'));
  expect(exported.name).toBe('scene.zdog.js');
  // (Windows puts CRLF line endings on the clipboard.)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.split('\r\n').join('\n')).toBe(exported.text);
  await expect(page.getByRole('status')).toContainText('Copied the Zdog script to the clipboard');
  expect(exported.text).not.toContain('gizmo');

  // Paste it into an empty page that has Zdog, as the comment at the top says.
  const blank = await context.newPage();
  await blank.setContent('<!doctype html><html><body></body></html>');
  await blank.addScriptTag({ path: 'node_modules/zdog/dist/zdog.dist.min.js' });
  await blank.addScriptTag({ content: exported.text });
  expect(await blank.evaluate('illo.children.length')).toBe(9);
  expect(await blank.evaluate('typeof cone1 === "object" && cone1.length')).toBe(4);
  const painted = await blank.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.zeditor-scene')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count += 1;
    return count;
  });
  expect(painted).toBeGreaterThan(5000);
});

test('full flow: move with the gizmo, rotate, undo, save, reload', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const grip = await arrowGrip(page, 'x');
  await drag(page, [grip, { x: grip.x + 40, y: grip.y }]);
  const movedX = await field(page, 'Position X').inputValue();
  expect(Number(movedX)).toBeGreaterThan(12);

  const center = await gizmoCenter(page);
  const radius = Math.max(...(await ring(page, 'z')).map((p) => p.x)) - center.x;
  // A quarter turn clockwise on the ring's left side (the right side may be under the Inspector).
  const arc = [150, 180, 210, 238].map((deg) => ({
    x: center.x + radius * Math.cos((deg * Math.PI) / 180),
    y: center.y + radius * Math.sin((deg * Math.PI) / 180),
  }));
  expect(await grabbable(page, 'rotate-z', [arc[0]])).toEqual(arc[0]);
  await drag(page, arc, { shift: true });
  await expect(field(page, 'Rotation Z')).toHaveValue('90');

  await page.keyboard.press('Control+z');
  await expect(field(page, 'Rotation Z')).toHaveValue('0');
  await expect(field(page, 'Position X')).toHaveValue(movedX);

  const saved = await downloaded(page, () => page.keyboard.press('Control+s'));
  const cone = JSON.parse(saved.text).shapes.find((s: { id: string }) => s.id === 'cone-1');
  expect(cone.translate.x).toBe(Number(movedX));
  expect(cone.rotate.z).toBe(0);

  await autosaved(page, `"x": ${movedX}`);
  await page.reload();
  await treeItem(page, 'Cone 1').click();
  await expect(field(page, 'Position X')).toHaveValue(movedX);
  await expect(field(page, 'Rotation Z')).toHaveValue('0');
});
