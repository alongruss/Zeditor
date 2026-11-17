import { parseCssColor, type Rgba } from '../../model/cssColor';
import type { DrawOp, LineCap, LineJoin, Paint, Point, Subpath } from '../../render/drawOps';
import {
  LOTTIE_VERSION,
  identityGroupTransform,
  shapeLayer,
  solidLayer,
  still,
  type FillItem,
  type GroupItem,
  type LottieAnimation,
  type LottieBezier,
  type PathItem,
  type ShapeLayer,
  type Static,
  type StrokeItem,
  type Vec2,
} from './lottieJson';

/**
 * Baked Lottie: every frame is written exactly as zdog drew it (see
 * render/drawOps.ts). Each run of identical frames becomes one shape layer
 * shown only for those frames, so front-to-back order can change from frame
 * to frame, which Lottie layers can't do by themselves.
 */

export interface BakeOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Solid background color, or null for a transparent background. */
  readonly background: string | null;
  readonly name: string;
}

export class LottieExportError extends Error {}

/** Coordinates are rounded to hundredths of a pixel: invisible, and keeps files small. */
export const round = (value: number): number => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const vec = (p: Point): Vec2 => [round(p.x), round(p.y)];
const relative = (p: Point, origin: Point): Vec2 => [round(p.x - origin.x), round(p.y - origin.y)];
/** A fresh [0, 0] each time: lottie-web edits tangents in place, so none may be shared. */
const zero = (): Vec2 => [0, 0];

export function colorOf(css: string): Rgba {
  const color = parseCssColor(css);
  if (!color) throw new LottieExportError(`Can't export the color "${css}".`);
  return color;
}

/** A recorded subpath as a Lottie bezier (vertices with relative tangents). */
export function toBezier(subpath: Subpath): LottieBezier {
  const vertices: Point[] = [subpath.start];
  const ins: Vec2[] = [zero()];
  const outs: Vec2[] = [zero()];
  for (const segment of subpath.segments) {
    const from = vertices[vertices.length - 1];
    if (segment.kind === 'bezier') outs[outs.length - 1] = relative(segment.c1, from);
    vertices.push(segment.to);
    ins.push(segment.kind === 'bezier' ? relative(segment.c2, segment.to) : zero());
    outs.push(zero());
  }
  // A closed path that ends where it started (e.g. a circle) would repeat its
  // first vertex; Lottie draws the closing segment itself, so fold it in.
  const last = vertices.length - 1;
  if (subpath.closed && last > 0) {
    const [first, end] = [vertices[0], vertices[last]];
    if (Math.abs(first.x - end.x) < 1e-6 && Math.abs(first.y - end.y) < 1e-6) {
      ins[0] = ins[last];
      vertices.pop();
      ins.pop();
      outs.pop();
    }
  }
  return { c: subpath.closed, v: vertices.map(vec), i: ins, o: outs };
}

export const CAPS: Record<LineCap, 1 | 2 | 3> = { butt: 1, round: 2, square: 3 };
export const JOINS: Record<LineJoin, 1 | 2 | 3> = { miter: 1, round: 2, bevel: 3 };

/**
 * A 0–255 color channel as Lottie's 0–1. lottie-web rounds down when turning
 * it back into 0–255, other players round to nearest; a quarter step above
 * the exact value comes back as the same number either way.
 */
export function channel(value: number): number {
  return Math.min(1, Math.round(((Math.round(value) + 0.25) / 255) * 10000) / 10000);
}

function styleItem(paint: Paint): (FillItem | StrokeItem) & { readonly o: Static<number> } {
  const color = colorOf(paint.color);
  const c = still([channel(color.r), channel(color.g), channel(color.b)] as const);
  // Players ignore a color's alpha, so it goes into the opacity.
  const o = still(round(color.a * 100));
  if (paint.kind === 'fill') return { ty: 'fl', c, o, r: 1 };
  return { ty: 'st', c, o, w: still(round(paint.width)), lc: CAPS[paint.cap], lj: JOINS[paint.join], ml: 4 };
}

/** One recorded op as a Lottie group. Null if nothing in it would show. */
export function toGroup(op: DrawOp, name: string): GroupItem | null {
  const paths: PathItem[] = op.subpaths.map((sub) => ({ ty: 'sh', ks: still(toBezier(sub)) }));
  const styles = op.paints.map(styleItem).filter((style) => style.o.k > 0);
  if (paths.length === 0 || styles.length === 0) return null;
  // The first style is drawn on top, so list them in reverse painting order
  // (zdog strokes, then fills over it: [fill, stroke]).
  return { ty: 'gr', nm: name, it: [...paths, ...styles.reverse(), identityGroupTransform()] };
}

/** One frame's groups, top first (zdog records back to front). */
function frameGroups(ops: readonly DrawOp[]): GroupItem[] {
  const groups: GroupItem[] = [];
  ops.forEach((op, i) => {
    const group = toGroup(op, `shape ${i + 1}`);
    if (group) groups.push(group);
  });
  return groups.reverse();
}

/**
 * A Lottie animation from recorded frames (frame 0 first). Runs of frames
 * that look the same share one layer.
 */
export function bakeLottie(frames: readonly (readonly DrawOp[])[], options: BakeOptions): LottieAnimation {
  if (frames.length === 0) throw new LottieExportError('There are no frames to export.');
  const runs: { start: number; end: number; groups: GroupItem[]; key: string }[] = [];
  frames.forEach((ops, frame) => {
    const groups = frameGroups(ops);
    const key = JSON.stringify(groups);
    const previous = runs[runs.length - 1];
    if (previous && previous.key === key) previous.end = frame + 1;
    else runs.push({ start: frame, end: frame + 1, groups, key });
  });

  const layers = runs.map((run, i) =>
    shapeLayer(i + 1, runs.length === 1 ? 'scene' : `frames ${run.start}-${run.end - 1}`, run.start, run.end, run.groups),
  );
  return lottieFile(layers, frames.length, options);
}

/** The file around some shape layers: the background (if any) underneath, the size and frame rate. */
export function lottieFile(shapeLayers: readonly ShapeLayer[], total: number, options: BakeOptions): LottieAnimation {
  const layers: LottieAnimation['layers'][number][] = [...shapeLayers];
  if (options.background !== null) {
    const color = colorOf(options.background);
    const hex = `#${[color.r, color.g, color.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
    // Last in the list, so it's drawn underneath everything. Its alpha goes into the layer's opacity.
    const solid = solidLayer(layers.length + 1, 'background', 0, total, [options.width, options.height], hex);
    layers.push(color.a < 1 ? { ...solid, ks: { ...solid.ks, o: still(round(color.a * 100)) } } : solid);
  }

  return {
    v: LOTTIE_VERSION,
    fr: options.fps,
    ip: 0,
    op: total,
    w: Math.round(options.width),
    h: Math.round(options.height),
    nm: options.name,
    ddd: 0,
    assets: [],
    layers,
  };
}
