import { expect, test, type Page } from '@playwright/test';
import { emptyPoint, fileMenu, openEditorForEachTest, treeItem } from './helpers';

openEditorForEachTest(test);

const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const redoButton = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true });
const shapeCount = (page: Page) => page.getByRole('list', { name: 'Shapes' }).getByRole('listitem');

/** Drags a number field's label `dx` pixels sideways. */
async function dragLabel(page: Page, field: string, dx: number) {
  const input = page.getByLabel(field, { exact: true });
  const label = page.locator('label.field-number', { has: input }).locator('.field-label');
  const box = (await label.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 4 + dx, y, { steps: 10 });
  await page.mouse.up();
}

test('Undo and Redo buttons and shortcuts step through changes', async ({ page }) => {
  await expect(undoButton(page)).toBeDisabled();
  await expect(redoButton(page)).toBeDisabled();

  await treeItem(page, 'Cone 1').click();
  const x = page.getByLabel('Position X', { exact: true });
  await x.fill('3');
  await x.press('Tab');
  await expect(undoButton(page)).toBeEnabled();

  await undoButton(page).click();
  await expect(x).toHaveValue('12');
  await expect(redoButton(page)).toBeEnabled();
  await redoButton(page).click();
  await expect(x).toHaveValue('3');

  // Shortcuts work with nothing selected, and Undo re-selects the shape it changed.
  const empty = await emptyPoint(page);
  await page.mouse.click(empty.x, empty.y);
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+z');
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(x).toHaveValue('12');
  await page.keyboard.press('Control+Shift+z');
  await expect(x).toHaveValue('3');
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue('12');
  await page.keyboard.press('Control+y');
  await expect(x).toHaveValue('3');
});

test('a label drag, or one visit to a field, is a single undo step', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  const width = page.getByLabel('Width', { exact: true });
  await dragLabel(page, 'Width', 40); // ten steps of 0.5, applied one by one
  await expect(width).toHaveValue('10');
  await undoButton(page).click();
  await expect(width).toHaveValue('5');
  await expect(undoButton(page)).toBeDisabled();

  // Typing "-2.5" applies -2 and then -2.5 as you type; both undo together.
  const x = page.getByLabel('Position X', { exact: true });
  await x.click();
  await x.press('Control+a');
  await x.pressSequentially('-2.5');
  await x.press('ArrowUp');
  await x.press('Tab');
  await expect(x).toHaveValue('-2');
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue('4');
  await expect(undoButton(page)).toBeDisabled();
});

test('Ctrl+Z in a number field undoes the scene; in the name box it undoes typing', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const x = page.getByLabel('Position X', { exact: true });
  await x.click();
  await x.press('Control+a');
  await x.pressSequentially('3.');
  await expect(x).toHaveValue('3.');
  await x.press('Control+z');
  await expect(x).toHaveValue('12');
  await expect(x).toBeFocused();

  await dragLabel(page, 'Rotation Y', 20);
  const rotation = page.getByLabel('Rotation Y', { exact: true });
  await expect(rotation).toHaveValue('5');

  await treeItem(page, 'Cone 1').dblclick();
  const name = page.getByRole('textbox', { name: 'Shape name' });
  await name.pressSequentially('Spike');
  await name.press('Control+z');
  await expect(rotation).toHaveValue('5');
  await name.press('Escape');
  await expect(name).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(rotation).toHaveValue('0');
});

test('Undo brings back a deleted shape, and a whole scene after New scene', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  await page.keyboard.press('Delete');
  await expect(treeItem(page, 'Box 1')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('svg.scene [data-shape-id="box-1"]').first()).toBeAttached();

  page.once('dialog', (dialog) => dialog.accept());
  await fileMenu(page, 'New scene');
  await expect(shapeCount(page)).toHaveCount(0);
  await undoButton(page).click();
  await expect(shapeCount(page)).toHaveCount(9);
  await expect(page.locator('svg.scene [data-shape-id="cone-1"]').first()).toBeAttached();
});
