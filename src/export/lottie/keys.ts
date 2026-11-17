import type { DrawOp, Paint } from '../../render/drawOps';
import { CAPS, JOINS, LottieExportError, channel, colorOf, lottieFile, round, toBezier, type BakeOptions } from './bake';
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
 * The nth path zdog draws on one frame is followed to the nth path on the
 * next, and its outline, colors, opacity and line width become animated
 * properties. A key is kept only where a straight line from the key before
 * can't reproduce the frames in between (to within a tenth of a pixel). Keys
 * a frame apart hold, so a sudden change (say two box faces trading places in
 * the drawing order) happens on the frame, as baked, never as an in-between.
 *
 * Lottie can't change the makeup of a layer, so wherever the paths drawn
 * stop lining up (a different number of them, or the nth one has a different
 * number of points or paints, as when a cone passes in front of a box), a new
 * layer starts: at worst, one per frame, as baked.
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

/** What must stay the same for a path to be keyed from frame to frame: its makeup. */
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
  if (flat.every((value) => value.every((n, d) => n === first[d]))) return still(values[0]);
  const keys = keyIndexes(flat, tolerance);
  return {
    a: 1,
    k: keys.map((index, j): LottieKey<T> => {
      const t = start + index;
      const s = wrap(values[index]);
      if (j === keys.length - 1) return { t, s };
      // A key on the very next frame: hold, so the step between frames looks as baked.
      return keys[j + 1] === index + 1 ? { t, s, h: 1 } : { t, s, ...LINEAR };
    }),
  };
}

type Rgb = readonly [number, number, number];

/** One path followed through a run of frames, as a Lottie group. Null if it never shows. */
function trackedGroup(frames: readonly Tracked[], start: number, name: string): GroupItem | null {
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
    const opacities = colors.map((color) => round(color.a * 100));
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
  /** The frames (after the first) where the paths drawn stop lining up, so a new layer starts. */
  readonly breaks: readonly number[];
}

/** A keyframed Lottie animation from recorded frames (frame 0 first). */
export function keyLottie(frames: readonly (readonly DrawOp[])[], options: BakeOptions): KeyedLottie {
  if (frames.length === 0) throw new LottieExportError('There are no frames to export.');
  const runs: { start: number; end: number; key: string; frames: Tracked[][] }[] = [];
  frames.forEach((ops, frame) => {
    const tracked = ops.map((op) => ({ beziers: op.subpaths.map(toBezier), paints: op.paints }));
    const key = ops.map((op, i) => signature(op, tracked[i].beziers)).join('|');
    const previous = runs[runs.length - 1];
    if (previous && previous.key === key) {
      previous.end = frame + 1;
      previous.frames.push(tracked);
    } else runs.push({ start: frame, end: frame + 1, key, frames: [tracked] });
  });

  const layers: ShapeLayer[] = runs.map((run, i) => {
    const count = run.frames[0].length;
    const groups: GroupItem[] = [];
    for (let op = 0; op < count; op++) {
      const group = trackedGroup(
        run.frames.map((frame) => frame[op]),
        run.start,
        `shape ${op + 1}`,
      );
      if (group) groups.push(group);
    }
    // zdog draws back to front; Lottie lists the top first.
    groups.reverse();
    return shapeLayer(i + 1, runs.length === 1 ? 'scene' : `frames ${run.start}-${run.end - 1}`, run.start, run.end, groups);
  });
  return { animation: lottieFile(layers, frames.length, options), breaks: runs.slice(1).map((run) => run.start) };
}
