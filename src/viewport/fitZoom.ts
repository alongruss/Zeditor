/** How many world units fit across the shorter side of the viewport. */
export const VIEW_SPAN = 32;

/**
 * Zoom (screen pixels per world unit) that fits `span` world units across the
 * shorter side of a `width` x `height` viewport.
 *
 * Returns `null` while the viewport has no usable size (e.g. before layout),
 * so the caller keeps its previous zoom. The 2020 editor computed a zoom of 0
 * here, which turned the SVG viewBox into `-Infinity` and left the viewport
 * blank until the window was resized.
 */
export function fitZoom(width: number, height: number, span: number = VIEW_SPAN): number | null {
  const shortSide = Math.min(width, height);
  if (!Number.isFinite(shortSide) || shortSide <= 0) return null;
  if (!Number.isFinite(span) || span <= 0) return null;
  return shortSide / span;
}
