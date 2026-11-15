/**
 * Where the selection's toolbar goes: next to what is selected, but never on
 * it and never on a gizmo handle. Pure, so it can be tested without a browser.
 */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Space between the toolbar and the area it keeps out of. */
export const TOOLBAR_GAP = 8;
/** The toolbar stays this far inside the viewport's edges. */
export const TOOLBAR_EDGE = 8;
/** Kept free at the viewport's bottom for the zoom pill. */
export const ZOOM_STRIP = 44;

export function union(a: Rect, b: Rect | null): Rect {
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/** A square of half-size `reach` around a point. */
export function squareAround(x: number, y: number, reach: number): Rect {
  return { left: x - reach, top: y - reach, right: x + reach, bottom: y + reach };
}

/**
 * The toolbar's top-left corner. It is centered on `anchorX` and goes just
 * above `keepOut`, else just below it. If neither fits (a selection taller
 * than the viewport), it tries the same around `fallback` (the gizmo's
 * square alone), and as a last resort sits at the top. It always stays
 * inside `area`, clear of the zoom pill's strip.
 */
export function toolbarPlacement(
  keepOut: Rect,
  fallback: Rect | null,
  anchorX: number,
  toolbar: Size,
  area: Size,
): { x: number; y: number } {
  const maxX = area.width - toolbar.width - TOOLBAR_EDGE;
  const x = Math.max(TOOLBAR_EDGE, Math.min(anchorX - toolbar.width / 2, maxX));
  const maxY = area.height - ZOOM_STRIP - toolbar.height;
  for (const box of fallback ? [keepOut, fallback] : [keepOut]) {
    const above = box.top - TOOLBAR_GAP - toolbar.height;
    if (above >= TOOLBAR_EDGE) return { x, y: above };
    const below = box.bottom + TOOLBAR_GAP;
    if (below <= maxY) return { x, y: below };
  }
  return { x, y: TOOLBAR_EDGE };
}
