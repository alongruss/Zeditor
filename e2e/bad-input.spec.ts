import { expect, test } from './fixtures';
import { field, fileMenu, inspector, openEditorForEachTest, treeItem } from './helpers';

// Every test here also fails if the page throws (openEditorForEachTest).
openEditorForEachTest(test);

async function addPolygon(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Polygon' }).click();
  await expect(field(page, 'Sides')).toBeVisible();
}

test('text that is not a number is never applied, and goes back when you leave the field', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const x = field(page, 'Position X');
  const before = await x.inputValue();
  for (const text of ['abc', '0x10', '-', 'NaN', '1,5', 'Infinity']) {
    await x.fill(text);
    await x.press('Tab');
    await expect(x, text).toHaveValue(before);
  }
});

test('a number past the limit becomes the limit, with a note saying so', async ({ page }) => {
  await addPolygon(page);
  const sides = field(page, 'Sides');
  // Too small waits until you leave the field ("1" may be on its way to "15"), then becomes the lowest.
  await sides.fill('1');
  await expect(inspector(page).getByText('At least 3', { exact: true })).toBeVisible();
  await sides.press('Enter');
  await expect(sides).toHaveValue('3');

  await sides.fill('5000');
  await expect(inspector(page).getByText('Up to 100', { exact: true })).toBeVisible();
  await sides.press('Tab');
  await expect(sides).toHaveValue('100');
  await expect(inspector(page).getByText('Up to 100', { exact: true })).toHaveCount(0);
  // The editor answers straight away: no freeze from building a huge polygon.
  await treeItem(page, 'Cone 1').click();
  await expect(field(page, 'Position X')).toBeVisible();

  // Huge and too-big-to-hold numbers.
  await treeItem(page, 'Cone 1').click();
  await field(page, 'Position X').fill('1e999');
  await field(page, 'Position X').press('Tab');
  await expect(field(page, 'Position X')).toHaveValue('100000');
  await field(page, 'Opacity').fill('500');
  await field(page, 'Opacity').press('Tab');
  await expect(field(page, 'Opacity')).toHaveValue('100');
});

test('the length and the frame box keep within their limits', async ({ page }) => {
  const length = page.getByLabel('Length in frames', { exact: true });
  await length.fill('999999999');
  await length.press('Tab');
  await expect(length).toHaveValue('100000');
  await length.fill('0');
  await length.press('Tab');
  await expect(length).toHaveValue('1');
  await length.fill('90');
  await length.press('Tab');

  const frame = page.getByLabel('Frame', { exact: true });
  await frame.fill('abc');
  await frame.press('Tab');
  await expect(frame).toHaveValue('0');
  await frame.fill('5000');
  await frame.press('Tab');
  await expect(frame).toHaveValue('89');
});

test('a name loses control characters and direction marks, and stops at 200 characters', async ({ page }) => {
  await treeItem(page, 'Cone 1').dblclick();
  const name = page.getByRole('textbox', { name: 'Shape name' });
  // A paste can bring tabs and direction marks along.
  await name.evaluate((input: HTMLInputElement) => {
    input.value = `‮evil\tcone ${'x'.repeat(300)}`;
  });
  await name.press('Enter');
  const item = page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: /^evil cone x+/ });
  await expect(item).toBeVisible();
  const text = (await inspector(page).locator('.inspector-name').textContent()) ?? '';
  expect(text.startsWith('evil cone x')).toBe(true);
  expect(Array.from(text)).toHaveLength(200);
});

/** Opens `text` as a scene file through File > Open. */
async function openFileText(page: import('@playwright/test').Page, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await fileMenu(page, 'Open…');
  await (await chooser).setFiles({ name: 'crafted.zeditor.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('a crafted file is refused with a calm note, and the scene stays as it was', async ({ page }) => {
  const shape = (extra: Record<string, unknown>) => JSON.stringify({ version: 4, shapes: [{ id: 'crafted-1', name: 'Crafted', ...extra }] });
  const files: [string, string, RegExp][] = [
    ['an empty path', shape({ type: 'Shape', props: { path: [] } }), /"path"/],
    ['a bezier with one point', shape({ type: 'Shape', props: { path: [{}, { bezier: [{ x: 1 }] }] } }), /"path"/],
    ['a billion sides', shape({ type: 'Polygon', props: { sides: 1e9 } }), /"sides" must be a whole number from 3 to 100/],
    ['a value that is null', shape({ type: 'Box', props: { width: null } }), /"width"/],
    ['a 10,000-character type', shape({ type: 'x'.repeat(10000) }), /unknown type: "x{40}…"/],
  ];
  for (const [what, text, says] of files) {
    await openFileText(page, text);
    const note = page.getByRole('alert');
    await expect(note, what).toContainText("Couldn't open crafted.zeditor.json.");
    await expect(note, what).toContainText(says);
    expect((await note.textContent())?.length ?? 0, what).toBeLessThan(200);
    await expect(treeItem(page, 'Cone 1'), what).toBeVisible();
    await expect(treeItem(page, 'Crafted'), what).toHaveCount(0);
  }
});

test('a file with a very long name opens with the name cut to 200 characters', async ({ page }) => {
  await openFileText(page, JSON.stringify({ version: 4, shapes: [{ id: 'long-1', name: `Long ${'n'.repeat(10000)}`, type: 'Box' }] }));
  const item = page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: /^Long n+/ });
  await expect(item).toBeVisible();
  await item.click();
  expect(Array.from((await inspector(page).locator('.inspector-name').textContent()) ?? '')).toHaveLength(200);
});
