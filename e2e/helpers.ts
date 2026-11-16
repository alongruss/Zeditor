import type { Page } from '@playwright/test';
import { expect, type test as fixtureTest } from './fixtures';

type TestType = typeof fixtureTest;

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

/**
 * Opens the toolbar's File menu and picks `item`: the item named exactly
 * that, perhaps followed by its shortcut ("Save" is "Save Ctrl+S", but
 * "Example: Nippu" isn't "Example: Nippu, walking").
 */
export async function fileMenu(page: Page, item: string): Promise<void> {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = new RegExp(`^${escaped}(\\s|$)`);
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name }).click();
}

// ----- gizmo -----

export interface Point {
  x: number;
  y: number;
}

export const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** The gizmo's center, in page coordinates. */
export async function gizmoCenter(page: Page): Promise<Point> {
  const gizmo = page.locator('svg.gizmo');
  const box = (await gizmo.boundingBox())!;
  const [x, y] = (await gizmo.getAttribute('data-center'))!.split(',').map(Number);
  return { x: box.x + x, y: box.y + y };
}

/** A move arrow's start and tip, in page coordinates. */
export async function arrow(page: Page, axis: 'x' | 'y' | 'z'): Promise<{ from: Point; to: Point }> {
  const box = (await page.locator('svg.gizmo').boundingBox())!;
  const line = page.locator(`.gizmo [data-handle="move-${axis}"] line.gizmo-line`);
  const [x1, y1, x2, y2] = await Promise.all(['x1', 'y1', 'x2', 'y2'].map((a) => line.getAttribute(a)));
  return {
    from: { x: box.x + Number(x1), y: box.y + Number(y1) },
    to: { x: box.x + Number(x2), y: box.y + Number(y2) },
  };
}

/** Points along a rotation ring, in page coordinates. */
export async function ring(page: Page, axis: 'x' | 'y' | 'z'): Promise<Point[]> {
  const box = (await page.locator('svg.gizmo').boundingBox())!;
  const points = await page.locator(`.gizmo [data-handle="rotate-${axis}"] polyline.gizmo-line`).getAttribute('points');
  return points!.split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x: box.x + x, y: box.y + y };
  });
}

/** The first of `candidates` where `handle` is the topmost thing under the pointer. */
export async function grabbable(page: Page, handle: string, candidates: Point[]): Promise<Point> {
  const index = await page.evaluate(
    ({ handle, candidates }) =>
      candidates.findIndex(
        (p) => document.elementFromPoint(p.x, p.y)?.closest('[data-handle]')?.getAttribute('data-handle') === handle,
      ),
    { handle, candidates },
  );
  expect(index, `a point where ${handle} can be grabbed`).toBeGreaterThanOrEqual(0);
  return candidates[index];
}

/** A grabbable point on a move arrow, as far along it as possible. */
export async function arrowGrip(page: Page, axis: 'x' | 'y' | 'z'): Promise<Point> {
  const { from, to } = await arrow(page, axis);
  const along = [0.85, 0.75, 0.65, 0.95, 0.55, 0.45].map((t) => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }));
  return grabbable(page, `move-${axis}`, along);
}

export async function drag(page: Page, path: Point[], options: { shift?: boolean } = {}) {
  if (options.shift) await page.keyboard.down('Shift');
  await page.mouse.move(path[0].x, path[0].y);
  await page.mouse.down();
  for (const point of path.slice(1)) await page.mouse.move(point.x, point.y, { steps: 4 });
  await page.mouse.up();
  if (options.shift) await page.keyboard.up('Shift');
}

/** Turns the camera by dragging empty space. */
/**
 * Waits until the scene has been redrawn. The viewport redraws on the next
 * animation frame, while panels and the gizmo update at once, so reading the
 * drawing straight after a change can see the old picture (on a slow machine
 * the gap is long enough to matter). Two frames: the redraw that was already
 * asked for comes first.
 */
export async function afterRedraw(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** Turns the camera by dragging empty space, then waits for the scene to be redrawn. */
export async function orbit(page: Page, dx: number, dy: number) {
  const start = await emptyPoint(page);
  await drag(page, [start, { x: start.x + dx, y: start.y + dy }]);
  await afterRedraw(page);
}

/** The middle of a shape's drawn bounds, or null while it isn't drawn (e.g. mid-redraw). */
export const centerOf = (bounds: { left: number; right: number; top: number; bottom: number } | null) =>
  bounds && {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
