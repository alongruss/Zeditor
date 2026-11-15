import { describe, expect, it } from 'vitest';
import { GIZMO_REACH_PX, project, unproject, type ViewTransform } from './gizmoMath';
import { squareAround, toolbarPlacement, TOOLBAR_EDGE, union, ZOOM_STRIP, type Rect } from './toolbarPlacement';

const TOOLBAR = { width: 220, height: 40 };

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const boxAt = (p: { x: number; y: number }): Rect => ({
  left: p.x,
  top: p.y,
  right: p.x + TOOLBAR.width,
  bottom: p.y + TOOLBAR.height,
});

describe('toolbarPlacement', () => {
  it('goes just above the selection, centered on the gizmo', () => {
    const keepOut = union({ left: 300, top: 250, right: 380, bottom: 330 }, squareAround(340, 290, GIZMO_REACH_PX));
    const p = toolbarPlacement(keepOut, null, 340, TOOLBAR, { width: 760, height: 572 });
    expect(p).toEqual({ x: 230, y: keepOut.top - 8 - 40 });
  });

  it('goes below when there is no room above, and stays clear of the zoom pill', () => {
    const keepOut = squareAround(380, 110, GIZMO_REACH_PX);
    const area = { width: 760, height: 572 };
    const p = toolbarPlacement(keepOut, null, 380, TOOLBAR, area);
    expect(p.y).toBe(keepOut.bottom + 8);
    expect(p.y + TOOLBAR.height).toBeLessThanOrEqual(area.height - ZOOM_STRIP);
  });

  it('stays inside the viewport sideways', () => {
    const keepOut = squareAround(30, 300, GIZMO_REACH_PX);
    expect(toolbarPlacement(keepOut, null, 30, TOOLBAR, { width: 760, height: 572 }).x).toBe(TOOLBAR_EDGE);
    expect(toolbarPlacement(keepOut, null, 750, TOOLBAR, { width: 760, height: 572 }).x).toBe(760 - 220 - TOOLBAR_EDGE);
  });

  it('never covers the gizmo, wherever the shape is, in viewports down to 900x600', () => {
    // 900x600 leaves the smallest viewport the smoke test uses: 380 x 452.
    for (const area of [{ width: 380, height: 452 }, { width: 760, height: 572 }, { width: 1200, height: 800 }]) {
      for (let x = 0; x <= area.width; x += 20) {
        for (let y = 0; y <= area.height; y += 20) {
          const gizmo = squareAround(x, y, GIZMO_REACH_PX);
          // A selection as tall as the viewport: only the gizmo square can be kept clear.
          const huge = union({ left: x - 50, top: -100, right: x + 50, bottom: area.height + 100 }, gizmo);
          for (const keepOut of [gizmo, huge]) {
            const p = toolbarPlacement(keepOut, gizmo, x, TOOLBAR, area);
            const visibleGizmo = { left: gizmo.left, top: Math.max(gizmo.top, 0), right: gizmo.right, bottom: gizmo.bottom };
            // The gizmo can only be avoided when it isn't itself taller than the room.
            if (y >= 0 && y <= area.height) expect(overlaps(boxAt(p), visibleGizmo), `${x},${y} in ${area.width}x${area.height}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('unproject', () => {
  const view: ViewTransform = {
    width: 760,
    height: 572,
    zoom: 18,
    rotate: { x: -0.4, y: 0.7, z: 0.2 },
    target: { x: 3, y: -2, z: 1 },
  };

  it('is the inverse of project on the plane facing the view', () => {
    for (const point of [{ x: 380, y: 286 }, { x: 10, y: 20 }, { x: 700, y: 500 }]) {
      const world = unproject(point, view);
      const back = project(world, view);
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it('puts the middle of the view on its target', () => {
    const world = unproject({ x: 380, y: 286 }, view);
    expect(world.x).toBeCloseTo(3, 6);
    expect(world.y).toBeCloseTo(-2, 6);
    expect(world.z).toBeCloseTo(1, 6);
  });
});
