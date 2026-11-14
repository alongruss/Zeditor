import { expect, test, type Page } from '@playwright/test';

/**
 * A point on screen where the topmost element belongs to shape `id`, so a
 * real mouse click there hits that shape (not one in front of it).
 */
async function pointOnShape(page: Page, id: string): Promise<{ x: number; y: number }> {
  let point: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      point = await page.locator('svg.scene').evaluate((svg, shapeId) => {
        const fractions = [0.5, 0.35, 0.65, 0.2, 0.8];
        const elements = [...svg.querySelectorAll(`[data-shape-id="${shapeId}"]`)];
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          for (const fx of fractions) {
            for (const fy of fractions) {
              const x = rect.left + rect.width * fx;
              const y = rect.top + rect.height * fy;
              const hit = document.elementFromPoint(x, y)?.closest('[data-shape-id]');
              if (hit?.getAttribute('data-shape-id') === shapeId) return { x, y };
            }
          }
        }
        return null;
      }, id);
      return point;
    }, { message: `a clickable point on ${id}` })
    .not.toBeNull();
  return point!;
}

/** A point inside the viewport with no shape under it. */
async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('svg.scene').boundingBox())!;
  const point = { x: box.x + 24, y: box.y + box.height - 24 };
  const isEmpty = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.matches('svg.scene') ?? false,
    point,
  );
  expect(isEmpty, 'bottom-left of the viewport is empty').toBe(true);
  return point;
}

async function shapeBounds(page: Page, id: string) {
  return page.locator('svg.scene').evaluate((svg, shapeId) => {
    const rects = [...svg.querySelectorAll(`[data-shape-id="${shapeId}"]`)]
      .filter((element) => element.isConnected)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);
    if (rects.length === 0) return null;
    return {
      left: Math.min(...rects.map((r) => r.left)),
      right: Math.max(...rects.map((r) => r.right)),
      top: Math.min(...rects.map((r) => r.top)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  }, id);
}

const treeItem = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: new RegExp(`^${name}\\b`) });

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('./');
  await expect(page.locator('svg.scene [data-shape-id]').first()).toBeAttached();
});

test.afterEach(() => {
  expect(pageErrors, 'uncaught errors in the page').toEqual([]);
});

// 2020 bug: clicking a Box face selected the inner face, and the gizmo then
// moved a different shape.
test('clicking any face of a Box selects the whole Box', async ({ page }) => {
  const point = await pointOnShape(page, 'box-1');
  await page.mouse.click(point.x, point.y);

  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');
  // 2020 bug: the Inspector filled in only if a redraw happened within a 100 ms timer.
  await expect(inspector(page).getByText('Box 1', { exact: true })).toBeVisible({ timeout: 250 });
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('4', { timeout: 250 });
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('5');
  await expect(page.locator('.selection-outline')).toBeVisible();
});

test('every element drawn in the scene belongs to a shape, from any camera angle', async ({ page }) => {
  const untagged = () =>
    page.locator('svg.scene').evaluate(
      (svg) => [...svg.children].filter((element) => !element.hasAttribute('data-shape-id')).length,
    );
  expect(await untagged()).toBe(0);
  // A Box draws six faces; every one must lead back to the Box.
  expect(await page.locator('svg.scene [data-shape-id="box-1"]').count()).toBeGreaterThanOrEqual(6);

  // Turn the camera so different faces and surfaces are drawn, and check again.
  const before = await shapeBounds(page, 'box-1');
  const start = await emptyPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y - 60, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => shapeBounds(page, 'box-1')).not.toEqual(before);
  expect(await untagged()).toBe(0);
});

// 2020 bug: after selecting Rectangle then Circle, editing X moved both, and
// they stayed linked from then on.
test('editing one shape never moves another', async ({ page }) => {
  await treeItem(page, 'Rectangle 1').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('-4');
  const rectBefore = await shapeBounds(page, 'rect-1');
  const circleBefore = await shapeBounds(page, 'ellipse-1');

  await treeItem(page, 'Circle 1').click();
  await page.getByLabel('Position X', { exact: true }).fill('9');

  await expect.poll(async () => (await shapeBounds(page, 'ellipse-1'))?.left).toBeGreaterThan(circleBefore!.left);
  expect(await shapeBounds(page, 'rect-1')).toEqual(rectBefore);

  await treeItem(page, 'Rectangle 1').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('-4');
  await page.getByLabel('Position Y', { exact: true }).fill('0');
  await treeItem(page, 'Circle 1').click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('9');
  await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('4');
});

test('Inspector edits redraw the shape', async ({ page }) => {
  await treeItem(page, 'Box 1').click();
  const before = (await shapeBounds(page, 'box-1'))!;
  await page.getByLabel('Width', { exact: true }).fill('10');
  await expect
    .poll(async () => {
      const after = (await shapeBounds(page, 'box-1'))!;
      return after.right - after.left;
    })
    .toBeGreaterThan((before.right - before.left) * 1.5);
});

test('half-typed numbers are kept on screen but not applied', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const field = page.getByLabel('Position X', { exact: true });
  await field.fill('-');
  await expect(field).toHaveValue('-');
  await field.press('Tab');
  await expect(field).toHaveValue('12');
});

test('arrow keys step values; Shift steps rotation by 15°', async ({ page }) => {
  await treeItem(page, 'Cone 1').click();
  const x = page.getByLabel('Position X', { exact: true });
  await x.press('ArrowUp');
  await expect(x).toHaveValue('12.5');
  const rotation = page.getByLabel('Rotation Y', { exact: true });
  await rotation.press('Shift+ArrowUp');
  await rotation.press('ArrowUp');
  await expect(rotation).toHaveValue('16');
});

test('dragging a number field label or unit changes the value; a click focuses the field', async ({
  page,
}) => {
  await treeItem(page, 'Box 1').click();
  const width = page.getByLabel('Width', { exact: true });
  const widthLabel = page.locator('label.field-number', { has: width }).locator('.field-label');
  const before = (await shapeBounds(page, 'box-1'))!;

  // 40 px right = 10 steps of 0.5.
  const labelBox = (await widthLabel.boundingBox())!;
  const y = labelBox.y + labelBox.height / 2;
  await page.mouse.move(labelBox.x + 4, y);
  await page.mouse.down();
  await page.mouse.move(labelBox.x + 44, y, { steps: 8 });
  await page.mouse.up();
  await expect(width).toHaveValue('10');
  await expect(width).not.toBeFocused();
  await expect
    .poll(async () => {
      const after = (await shapeBounds(page, 'box-1'))!;
      return after.right - after.left;
    })
    .toBeGreaterThan((before.right - before.left) * 1.5);

  // Dragging the "°" unit works too; left lowers the value.
  const rotation = page.getByLabel('Rotation Y', { exact: true });
  const degree = page.locator('label.field-number', { has: rotation }).locator('.field-suffix');
  const degreeBox = (await degree.boundingBox())!;
  const dy = degreeBox.y + degreeBox.height / 2;
  await page.mouse.move(degreeBox.x + 2, dy);
  await page.mouse.down();
  await page.mouse.move(degreeBox.x - 18, dy, { steps: 5 });
  await page.mouse.up();
  await expect(rotation).toHaveValue('-5');

  // A plain click on the label still puts the cursor in the field.
  await widthLabel.click();
  await expect(width).toBeFocused();
  await expect(width).toHaveValue('10');
});

test('add, rename, duplicate and delete shapes', async ({ page }) => {
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Box' }).click();
  await expect(treeItem(page, 'Box 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('svg.scene [data-shape-id="box-2"]').first()).toBeAttached();

  await treeItem(page, 'Box 2').dblclick();
  const nameInput = page.getByRole('textbox', { name: 'Shape name' });
  await nameInput.fill('Crate');
  await nameInput.press('Enter');
  await expect(treeItem(page, 'Crate')).toBeVisible();
  await expect(inspector(page).getByText('Crate', { exact: true })).toBeVisible();

  await page.keyboard.press('Control+d');
  await expect(treeItem(page, 'Box 3')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Delete');
  await expect(treeItem(page, 'Box 3')).toHaveCount(0);
  await expect(page.locator('svg.scene [data-shape-id="box-3"]')).toHaveCount(0);
  await expect(inspector(page).getByText('Select a shape to edit it.')).toBeVisible();
});

test('right-click menu deletes the shape under the pointer', async ({ page }) => {
  const point = await pointOnShape(page, 'cone-1');
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(treeItem(page, 'Cone 1')).toHaveAttribute('aria-pressed', 'true');

  // The cone sits near the right edge; the menu must still fit inside the viewport.
  const menu = (await page.getByRole('menu', { name: 'Shape actions' }).boundingBox())!;
  const viewport = (await page.locator('.viewport').boundingBox())!;
  expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.x + viewport.width);
  expect(menu.y + menu.height).toBeLessThanOrEqual(viewport.y + viewport.height);

  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await expect(treeItem(page, 'Cone 1')).toHaveCount(0);
  await expect(page.locator('svg.scene [data-shape-id="cone-1"]')).toHaveCount(0);
});

test('dragging turns the camera without clearing the selection; a click on empty space does', async ({
  page,
}) => {
  await treeItem(page, 'Box 1').click();
  const before = await shapeBounds(page, 'box-1');

  const start = await emptyPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y - 30, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => shapeBounds(page, 'box-1')).not.toEqual(before);
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'true');

  const empty = await emptyPoint(page);
  await page.mouse.click(empty.x, empty.y);
  await expect(treeItem(page, 'Box 1')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.selection-outline')).toBeHidden();
});

test('New scene asks first, then empties the scene', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'New scene' }).click();
  await expect(page.getByRole('list', { name: 'Shapes' }).getByRole('listitem')).toHaveCount(9);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New scene' }).click();
  await expect(page.getByText('No shapes yet. Use Add to create one.')).toBeVisible();
  await expect(page.locator('svg.scene [data-shape-id]')).toHaveCount(0);
});
