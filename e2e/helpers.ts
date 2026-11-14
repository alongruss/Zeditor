import { expect, type Page, type test as baseTest } from '@playwright/test';

type TestType = typeof baseTest;

/**
 * A point on screen where the topmost element belongs to shape `id`, so a
 * real mouse click there hits that shape (not one in front of it).
 */
export async function pointOnShape(page: Page, id: string): Promise<{ x: number; y: number }> {
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
export async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('svg.scene').boundingBox())!;
  const point = { x: box.x + 24, y: box.y + box.height - 24 };
  const isEmpty = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.matches('svg.scene') ?? false,
    point,
  );
  expect(isEmpty, 'bottom-left of the viewport is empty').toBe(true);
  return point;
}

export async function shapeBounds(page: Page, id: string) {
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

export const treeItem = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: new RegExp(`^${name}\\b`) });

export const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

/** Opens the editor before each test and fails any test that throws in the page. */
export function openEditorForEachTest(test: TestType): void {
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
}
