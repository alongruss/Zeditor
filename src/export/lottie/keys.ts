import type { DrawOp, Paint } from '../../render/drawOps';
import { CAPS, JOINS, LottieExportError, bakeLottie, channel, colorOf, lottieFile, round, toBezier, type BakeOptions } from './bake';
import { boundsOf, overlap, type Bounds } from './cull';
import {
  identityGroupTransform,
  shapeLayer,
  still,
  type FillItem,
  type GroupItem,
  type LottieAnimation,
  type LottieBezier,
  type LottieKey,
  type PathItem,
  type Prop,
  type ShapeLayer,
  type StrokeItem,
} from './lottieJson';

/**
 * Keyframed Lottie: the same picture as the baked export on every frame,
 * written as keys instead of every frame, so files are much smaller.
 *
 * Each path zdog draws is followed from frame to frame (by the zdog item that
 * drew it, see DrawOp.source), and its outline, colors, opacity and line
 * width become animated properties. A key is kept only where a straight line
 * from the key before can't reproduce the frames in between (to within a
 * tenth of a pixel). Keys a frame apart hold, so a sudden change (a path
 * appearing, or moving in the drawing order) happens on the frame, as baked,
 * never as an in-between.
 *
 * Lottie can't change the drawing order within a layer; see keyLottie for
 * how paths that pass in front of one another are handled.
 */

/** How far a keyed value may be from the baked one, on any frame. */
const TOLERANCE = {
  /** Pixels. */
  path: 0.1,
  /** A 0–1 color channel: well under one step of 255. */
  color: 0.0015,
  /** 0–100. */
  opacity: 0.2,
  /** Pixels. */
  width: 0.05,
};

interface Tracked {
  readonly beziers: readonly LottieBezier[];
  readonly paints: readonly Paint[];
}

/** What must stay the same for a path to be keyed from frame to frame, besides who drew it: its makeup. */
function signature(op: DrawOp, beziers: readonly LottieBezier[]): string {
  const outline = beziers.map((b) => `${b.c ? 'c' : 'o'}${b.v.length}`).join(',');
  const paints = op.paints.map((p) => (p.kind === 'fill' ? 'f' : `s${CAPS[p.cap]}${JOINS[p.join]}`)).join('');
  return `${outline}:${paints}`;
}

const flatBezier = (b: LottieBezier): number[] => [...b.v.flat(), ...b.i.flat(), ...b.o.flat()];

/**
 * Which values (indexes into `values`) become keys: the first, the last, and
 * any needed so that a straight line between neighbouring keys stays within
 * `tolerance` of every value in between.
 */
export function keyIndexes(values: readonly (readonly number[])[], tolerance: number): number[] {
  const fits = (a: number, c: number) => {
    const [from, to] = [values[a], values[c]];
    for (let f = a + 1; f < c; f++) {
      const amount = (f - a) / (c - a);
      const value = values[f];
      for (let d = 0; d < value.length; d++) {
        if (Math.abs(from[d] + (to[d] - from[d]) * amount - value[d]) > tolerance) return false;
      }
    }
    return true;
  };
  const keys = [0];
  let a = 0;
  while (a < values.length - 1) {
    let b = a + 1;
    while (b + 1 < values.length && fits(a, b + 1)) b += 1;
    keys.push(b);
    a = b;
  }
  return keys;
}

const LINEAR = { o: { x: 0, y: 0 }, i: { x: 1, y: 1 } } as const;

/**
 * A property from its value on each frame of a run starting at `start`:
 * still if it never changes, otherwise keyed.
 */
function property<T>(
  values: readonly T[],
  numbers: (value: T) => readonly number[],
  wrap: (value: T) => LottieKey<T>['s'],
  tolerance: number,
  start: number,
): Prop<T> {
  const flat = values.map(numbers);
  const first = flat[0];
  // Copies throughout: lottie-web rewrites what it's given (see lottieJson.ts), and a hidden
  // frame holds the same value object as the frame before it.
  if (flat.every((value) => value.every((n, d) => n === first[d]))) return still(structuredClone(values[0]));
  const keys = keyIndexes(flat, tolerance);
  return {
    a: 1,
    k: keys.map((index, j): LottieKey<T> => {
      const t = start + index;
      const s = structuredClone(wrap(values[index]));
      if (j === keys.length - 1) return { t, s };
      // A key on the very next frame: hold, so the step between frames looks as baked.
      return keys[j + 1] === index + 1 ? { t, s, h: 1 } : { t, s, ...structuredClone(LINEAR) };
    }),
  };
}

type Rgb = readonly [number, number, number];

/**
 * One slot followed through a run of frames, as a Lottie group: its path on
 * the frames it shows (`null` where it's hidden: drawn elsewhere in the order,
 * out of view, or not drawn). Null if it never shows.
 */
function trackedGroup(slot: readonly (Tracked | null)[], start: number, name: string): GroupItem | null {
  // Hidden frames keep the nearest shown value (so they need no keys) and get opacity 0.
  const firstShown = slot.find((frame): frame is Tracked => frame !== null);
  if (!firstShown) return null;
  let held = firstShown;
  const frames = slot.map((frame) => (frame === null ? held : (held = frame)));
  const shown = slot.map((frame) => frame !== null);

  const paths: PathItem[] = frames[0].beziers.map((_, b) => ({
    ty: 'sh',
    ks: property(
      frames.map((frame) => frame.beziers[b]),
      flatBezier,
      (bezier) => [bezier] as unknown as LottieKey<LottieBezier>['s'],
      TOLERANCE.path,
      start,
    ),
  }));
  const styles: (FillItem | StrokeItem)[] = [];
  frames[0].paints.forEach((first, p) => {
    const colors = frames.map((frame) => colorOf(frame.paints[p].color));
    const opacities = colors.map((color, f) => (shown[f] ? round(color.a * 100) : 0));
    if (opacities.every((o) => o <= 0)) return; // never shows
    const number = (n: number) => [n];
    const c = property<Rgb>(
      colors.map((color) => [channel(color.r), channel(color.g), channel(color.b)] as const),
      (rgb) => rgb,
      (rgb) => rgb as LottieKey<Rgb>['s'],
      TOLERANCE.color,
      start,
    );
    // Players ignore a color's alpha, so it goes into the opacity.
    const o = property(opacities, number, (n) => [n] as const, TOLERANCE.opacity, start);
    if (first.kind === 'fill') {
      styles.push({ ty: 'fl', c, o, r: 1 });
    } else {
      const widths = frames.map((frame) => {
        const paint = frame.paints[p];
        return round(paint.kind === 'stroke' ? paint.width : 0);
      });
      const w = property(widths, number, (n) => [n] as const, TOLERANCE.width, start);
      styles.push({ ty: 'st', c, o, w, lc: CAPS[first.cap], lj: JOINS[first.join], ml: 4 });
    }
  });
  if (styles.length === 0) return null;
  // As baked: the first style is drawn on top, so they go in reverse painting order.
  return { ty: 'gr', nm: name, it: [...paths, ...styles.reverse(), identityGroupTransform()] };
}

export interface KeyedLottie {
  readonly animation: LottieAnimation;
  /** The frames (after the first) where so many paths changed places that a new layer starts. */
  readonly breaks: readonly number[];
  /** True if keys came out bigger than baking, so the file is baked instead (the same picture). */
  readonly baked: boolean;
}

/** A place in a layer's drawing order, for one path (by who drew it and its makeup). */
interface Slot {
  readonly key: string;
  /** The path on each frame of the run so far; null where this slot is hidden. */
  readonly frames: (Tracked | null)[];
}

/**
 * Most slots a layer may have, per path drawn on a frame: past this, a new
 * layer is cheaper than more hidden copies.
 */
const SLOTS_PER_PATH = 8;
const MIN_SLOTS = 64;

/**
 * A keyframed Lottie animation from recorded frames (frame 0 first).
 *
 * Each path keeps its place (a slot) in the layer from frame to frame. The
 * order only has to hold between paths that overlap on screen: zdog re-sorts
 * by depth all the time, but two paths that don't touch can be drawn in
 * either order. When a path must now be drawn after one it overlaps that's in
 * a later slot, it gets a slot past that one and its old slot is hidden from
 * then on. A path that isn't drawn on a frame (say, it's out of view) is
 * hidden there. Only when the slots pile up does a new layer start, and if
 * keys still come out bigger than baking, the file is baked instead.
 */
export function keyLottie(frames: readonly (readonly DrawOp[])[], options: BakeOptions): KeyedLottie {
  if (frames.length === 0) throw new LottieExportError('There are no frames to export.');
  interface Run {
    readonly start: number;
    end: number;
    readonly slots: Slot[];
  }
  const runs: Run[] = [];
  let lastSlot = new Map<string, Slot>();
  const widest = Math.max(1, ...frames.map((ops) => ops.length));
  const maxSlots = Math.max(MIN_SLOTS, SLOTS_PER_PATH * widest);

  frames.forEach((ops, frame) => {
    let run = runs[runs.length - 1];
    if (!run || run.slots.length > maxSlots) {
      run = { start: frame, end: frame, slots: [] };
      runs.push(run);
      lastSlot = new Map();
    }
    const index = frame - run.start;
    const slots = run.slots;
    const used = new Set<Slot>();
    const drawn: { bounds: Bounds; slot: Slot }[] = [];
    for (const op of ops) {
      const tracked = { beziers: op.subpaths.map(toBezier), paints: op.paints };
      const key = `${op.source ?? '?'}|${signature(op, tracked.beziers)}`;
      const bounds = boundsOf(op);
      // It must come after every path drawn before it that it overlaps.
      let lowest = 0;
      for (const earlier of drawn) {
        if (overlap(bounds, earlier.bounds)) lowest = Math.max(lowest, slots.indexOf(earlier.slot) + 1);
      }
      // Its slot from the frame before, if that's still late enough; else a free one like it; else a new one.
      const previous = lastSlot.get(key);
      let at = previous && !used.has(previous) ? slots.indexOf(previous) : -1;
      if (at < lowest) at = slots.findIndex((slot, i) => i >= lowest && slot.key === key && !used.has(slot));
      if (at === -1) {
        at = lowest;
        slots.splice(at, 0, { key, frames: new Array<Tracked | null>(index).fill(null) });
      }
      const slot = slots[at];
      slot.frames[index] = tracked;
      used.add(slot);
      lastSlot.set(key, slot);
      drawn.push({ bounds, slot });
    }
    for (const slot of slots) if (!used.has(slot)) slot.frames[index] = null;
    run.end = frame + 1;
  });

  const layers: ShapeLayer[] = runs.map((r, i) => {
    const groups: GroupItem[] = [];
    r.slots.forEach((slot, n) => {
      const group = trackedGroup(slot.frames, r.start, `shape ${n + 1}`);
      if (group) groups.push(group);
    });
    // zdog draws back to front; Lottie lists the top first.
    groups.reverse();
    return shapeLayer(i + 1, runs.length === 1 ? 'scene' : `frames ${r.start}-${r.end - 1}`, r.start, r.end, groups);
  });
  const keyed = lottieFile(layers, frames.length, options);
  const baked = bakeLottie(frames, options);
  // Nothing changes over time (one baked layer): keys have nothing to save, and that's fine.
  if (baked.layers.filter((layer) => layer.ty === 4).length <= 1) return { animation: baked, breaks: [], baked: false };
  if (JSON.stringify(baked).length < JSON.stringify(keyed).length) return { animation: baked, breaks: [], baked: true };
  return { animation: keyed, breaks: runs.slice(1).map((r) => r.start), baked: false };
}
