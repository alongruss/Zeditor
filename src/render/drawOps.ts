import type * as ZdogTypes from 'zdog';
import type { Scene } from '../model/types';
import { Zdog } from '../zdog';
import { buildZdogGraph } from './zdogGraph';
import { rootTranslate, type ViewSpec } from './view';

/**
 * Captures a frame exactly as zdog draws it, as flat 2D paths in drawing
 * order (back to front). zdog's public `renderGraphCanvas(ctx)` sends every
 * shape through a handful of canvas calls; this module plays the canvas and
 * writes them down. The Lottie export turns the result into Lottie shapes.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Segment =
  | { readonly kind: 'line'; readonly to: Point }
  | { readonly kind: 'bezier'; readonly c1: Point; readonly c2: Point; readonly to: Point };

export interface Subpath {
  readonly start: Point;
  readonly segments: readonly Segment[];
  readonly closed: boolean;
}

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export type Paint =
  | { readonly kind: 'stroke'; readonly color: string; readonly width: number; readonly cap: LineCap; readonly join: LineJoin }
  | { readonly kind: 'fill'; readonly color: string };

/** One path, painted once or more (zdog strokes, then fills on top). */
export interface DrawOp {
  readonly subpaths: readonly Subpath[];
  /** In the order they were painted. */
  readonly paints: readonly Paint[];
  /**
   * Which zdog item drew it, the same on every frame of the same scene: its
   * place in the zdog tree (child indexes from the root), then a count for
   * the paths one item draws (a Group draws all of its children's). The
   * keyframed Lottie export follows a path from frame to frame by it.
   */
  readonly source?: string;
}

const TAU = Math.PI * 2;

/**
 * Cubic bezier segments for a canvas `arc(cx, cy, r, from, to, anticlockwise)`,
 * at most a quarter turn each, following the canvas rules for which way and
 * how far it goes.
 */
export function arcSegments(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  anticlockwise: boolean,
): { start: Point; segments: Segment[] } {
  let sweep: number;
  if (!anticlockwise) {
    sweep = to - from >= TAU ? TAU : ((((to - from) % TAU) + TAU) % TAU);
  } else {
    sweep = from - to >= TAU ? -TAU : -((((from - to) % TAU) + TAU) % TAU);
  }
  const at = (angle: number): Point => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  const start = at(from);
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (TAU / 4) - 1e-9));
  const step = sweep / count;
  const k = (4 / 3) * Math.tan(step / 4); // handle length for a circular arc of `step`
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = from + step * i;
    const a1 = a0 + step;
    const p0 = at(a0);
    const p1 = at(a1);
    segments.push({
      kind: 'bezier',
      c1: { x: p0.x - k * r * Math.sin(a0), y: p0.y + k * r * Math.cos(a0) },
      c2: { x: p1.x + k * r * Math.sin(a1), y: p1.y - k * r * Math.cos(a1) },
      to: p1,
    });
  }
  return { start, segments: sweep === 0 ? [] : segments };
}

interface MutableSubpath {
  start: Point;
  segments: Segment[];
  closed: boolean;
}

/**
 * A stand-in canvas context that records drawing. It is strict: zdog using
 * any other canvas feature throws, so a zdog code path the export doesn't
 * understand fails loudly instead of being dropped from the picture.
 */
export function createRecorder(): {
  readonly ctx: CanvasRenderingContext2D;
  readonly ops: DrawOp[];
  /** Tags the paths drawn from now on (see DrawOp.source). */
  setSource(source: string | undefined): void;
} {
  const ops: DrawOp[] = [];
  let source: string | undefined;
  let subpaths: MutableSubpath[] = [];
  let current: MutableSubpath | null = null;
  /** Where a new subpath starts after closePath (the canvas rule). */
  let restartAt: Point | null = null;
  /** Bumped on every path change, so a fill after a stroke of the same path joins its op. */
  let pathVersion = 0;
  let paintedVersion = -1;

  const state = {
    strokeStyle: '#000000' as string,
    fillStyle: '#000000' as string,
    lineWidth: 1,
    // zdog's Illustration sets round caps and joins before drawing.
    lineCap: 'round' as LineCap,
    lineJoin: 'round' as LineJoin,
  };

  const begin = (point: Point) => {
    current = { start: point, segments: [], closed: false };
    subpaths.push(current);
    restartAt = null;
  };
  const ensureSubpath = (point: Point) => {
    if (current) return;
    begin(restartAt ?? point);
  };
  const changed = () => {
    pathVersion += 1;
  };
  const snapshot = (): Subpath[] =>
    subpaths
      .filter((sub) => sub.segments.length > 0)
      .map((sub) => ({ start: sub.start, segments: [...sub.segments], closed: sub.closed }));
  const paint = (p: Paint) => {
    const last = ops[ops.length - 1];
    if (last && paintedVersion === pathVersion) {
      ops[ops.length - 1] = { subpaths: last.subpaths, paints: [...last.paints, p] };
      return;
    }
    const recorded = snapshot();
    if (recorded.length === 0) return;
    ops.push(source === undefined ? { subpaths: recorded, paints: [p] } : { subpaths: recorded, paints: [p], source });
    paintedVersion = pathVersion;
  };

  const methods = {
    beginPath() {
      subpaths = [];
      current = null;
      restartAt = null;
      changed();
    },
    moveTo(x: number, y: number) {
      begin({ x, y });
      changed();
    },
    lineTo(x: number, y: number) {
      if (!current && !restartAt) begin({ x, y });
      else {
        ensureSubpath({ x, y });
        current!.segments.push({ kind: 'line', to: { x, y } });
      }
      changed();
    },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
      ensureSubpath({ x: c1x, y: c1y });
      current!.segments.push({ kind: 'bezier', c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, to: { x, y } });
      changed();
    },
    closePath() {
      if (current) {
        current.closed = true;
        restartAt = current.start;
        current = null;
      }
      changed();
    },
    arc(cx: number, cy: number, r: number, from: number, to: number, anticlockwise = false) {
      const { start, segments } = arcSegments(cx, cy, r, from, to, anticlockwise);
      // Like canvas: join the arc to the path so far with a straight line.
      if (current || restartAt) {
        ensureSubpath(start);
        current!.segments.push({ kind: 'line', to: start });
      } else begin(start);
      current!.segments.push(...segments);
      changed();
    },
    stroke() {
      paint({ kind: 'stroke', color: state.strokeStyle, width: state.lineWidth, cap: state.lineCap, join: state.lineJoin });
    },
    fill() {
      paint({ kind: 'fill', color: state.fillStyle });
    },
  };

  const ctx = new Proxy(methods, {
    get(target, key) {
      if (typeof key === 'string' && key in state) return state[key as keyof typeof state];
      if (typeof key === 'string' && key in target) return target[key as keyof typeof target];
      throw new Error(`zdog used canvas feature "${String(key)}", which the Lottie export doesn't handle.`);
    },
    set(_target, key, value) {
      if (typeof key === 'string' && key in state) {
        (state as Record<string, unknown>)[key] = value;
        return true;
      }
      throw new Error(`zdog set canvas feature "${String(key)}", which the Lottie export doesn't handle.`);
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    ops,
    setSource(next) {
      source = next;
    },
  };
}

/** `place#n`: the item's nth path on this frame. */
function numbered(place: string, counts: Map<string, number>): string {
  const n = counts.get(place) ?? 0;
  counts.set(place, n + 1);
  return `${place}#${n}`;
}

const toScreen = (view: ViewSpec) => (p: Point): Point => ({
  x: view.width / 2 + p.x * view.pixelsPerUnit,
  y: view.height / 2 + p.y * view.pixelsPerUnit,
});

function mapSegment(segment: Segment, map: (p: Point) => Point): Segment {
  return segment.kind === 'line'
    ? { kind: 'line', to: map(segment.to) }
    : { kind: 'bezier', c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) };
}


/**
 * Draws `scene` through `view` and returns what was drawn, back to front, in
 * picture pixels (y down, like the screen).
 */
export function recordFrame(scene: Scene, view: ViewSpec): DrawOp[] {
  // The root turns the world; moving it by the turned target puts the target at the center.
  const root: ZdogTypes.Anchor = new Zdog.Anchor({ rotate: view.rotate, translate: rootTranslate(view) });
  buildZdogGraph(scene, root);
  root.updateGraph();

  // Each item's place in the tree, so every path can say which item drew it.
  const places = new Map<ZdogTypes.Anchor, string>();
  const walk = (node: ZdogTypes.Anchor, place: string) => {
    places.set(node, place);
    (node as unknown as { children: ZdogTypes.Anchor[] }).children.forEach((child, i) => walk(child, `${place}/${i}`));
  };
  walk(root, '');

  // What zdog's renderGraphCanvas does, one item at a time.
  const recorder = createRecorder();
  const items = (root as unknown as { flatGraph: { render(ctx: CanvasRenderingContext2D, renderer: unknown): void }[] }).flatGraph;
  for (const item of items) {
    recorder.setSource(places.get(item as unknown as ZdogTypes.Anchor));
    item.render(recorder.ctx, (Zdog as unknown as { CanvasRenderer: unknown }).CanvasRenderer);
  }

  const map = toScreen(view);
  const counts = new Map<string, number>();
  return recorder.ops.map((op) => ({
    ...(op.source === undefined ? {} : { source: numbered(op.source, counts) }),
    subpaths: op.subpaths.map((sub) => ({
      start: map(sub.start),
      segments: sub.segments.map((segment) => mapSegment(segment, map)),
      closed: sub.closed,
    })),
    paints: op.paints.map((p) => (p.kind === 'stroke' ? { ...p, width: p.width * view.pixelsPerUnit } : p)),
  }));
}
