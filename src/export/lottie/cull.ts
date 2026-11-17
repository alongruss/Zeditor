import type { DrawOp, Paint } from '../../render/drawOps';

/** The Lottie export's miter limit (see bake.ts): a mitered corner reaches at most this many half-widths out. */
const MITER_LIMIT = 4;
/** Antialiasing can tint a pixel just outside a shape's edge. */
const SOFT_EDGE = 1;

/** How far past its path a paint can reach, in pixels. */
function reach(paint: Paint): number {
  if (paint.kind === 'fill') return 0;
  const half = paint.width / 2;
  if (paint.join === 'miter') return half * MITER_LIMIT;
  // A square cap's corner sticks out diagonally; round caps and joins stay within half the width.
  return paint.cap === 'square' ? half * Math.SQRT2 : half;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Everywhere a path can paint: its points and bezier handles (a curve stays
 * inside them), widened by how far its strokes reach, plus a pixel for
 * antialiasing.
 */
export function boundsOf(op: DrawOp): Bounds {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const add = (p: { x: number; y: number }) => {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  };
  for (const sub of op.subpaths) {
    add(sub.start);
    for (const segment of sub.segments) {
      add(segment.to);
      if (segment.kind === 'bezier') {
        add(segment.c1);
        add(segment.c2);
      }
    }
  }
  const margin = Math.max(0, ...op.paints.map(reach)) + SOFT_EDGE;
  return { left: left - margin, top: top - margin, right: right + margin, bottom: bottom + margin };
}

/** True if two paths' bounds touch, so which is drawn first can matter. */
export const overlap = (a: Bounds, b: Bounds): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** True if any of the path could show in a `width` x `height` picture (nothing that shows is ever dropped). */
export function inView(op: DrawOp, width: number, height: number): boolean {
  return overlap(boundsOf(op), { left: 0, top: 0, right: width, bottom: height });
}

/** A frame with the paths that can't show left out. */
export const cullFrame = (ops: readonly DrawOp[], width: number, height: number): DrawOp[] =>
  ops.filter((op) => inView(op, width, height));
