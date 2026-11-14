import { propertySpec, readBase, writeBase, type PropertySpec } from './animatable';
import { parseCssColor, type Rgba } from './cssColor';
import { ease } from './easing';
import type { ShapePatch } from './scene';
import type { Easing, Keyframe, PropertyPath, ShapeData, TrackValue, Tracks } from './types';

/**
 * Keyframes: what a property's value is at a frame, and edits made at the
 * playhead. Pure functions on immutable data.
 */

/** Easing for a brand-new key with no key before it. */
export const DEFAULT_EASING: Easing = 'easeInOut';

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** A color as `#rrggbb`, or `#rrggbbaa` when it isn't fully opaque. */
export function hexOf(color: Rgba): string {
  const alpha = Math.round(color.a * 255);
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${alpha === 255 ? '' : hex2(alpha)}`;
}

function mixColors(a: string, b: string, t: number): string | null {
  const from = parseCssColor(a);
  const to = parseCssColor(b);
  if (!from || !to) return null;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return hexOf({ r: mix(from.r, to.r), g: mix(from.g, to.g), b: mix(from.b, to.b), a: mix(from.a, to.a) });
}

/** The value `amount` (0–1, already eased) of the way from `a` to `b`. */
function between(spec: PropertySpec, a: TrackValue, b: TrackValue, amount: number): TrackValue {
  if (spec.kind === 'number' && typeof a === 'number' && typeof b === 'number') {
    const value = a + (b - a) * amount;
    return spec.integer ? Math.round(value) : value;
  }
  if ((spec.kind === 'color' || spec.kind === 'face') && typeof a === 'string' && typeof b === 'string') {
    return mixColors(a, b, amount) ?? a;
  }
  return a; // hold: keeps the earlier key's value until the next key
}

/** A track's value at `frame`: tweened between keys, held before the first and after the last. */
export function trackValueAt(track: readonly Keyframe[], frame: number, spec: PropertySpec): TrackValue {
  const first = track[0];
  const last = track[track.length - 1];
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (track[i + 1].frame <= frame) i += 1;
  const from = track[i];
  if (from.frame === frame) return from.value;
  const to = track[i + 1];
  return between(spec, from.value, to.value, ease(from.easing, (frame - from.frame) / (to.frame - from.frame)));
}

function specFor(shape: ShapeData, path: PropertyPath): PropertySpec {
  const spec = propertySpec(shape.type, path);
  if (!spec) throw new Error(`${shape.type} has no animatable property ${path}`);
  return spec;
}

/** A property's value at `frame`: from its track if it has one, otherwise its own value. */
export function valueAt(shape: ShapeData, path: PropertyPath, frame: number): TrackValue {
  const track = shape.tracks?.[path];
  return track && track.length > 0 ? trackValueAt(track, frame, specFor(shape, path)) : readBase(shape, path);
}

export type KeyState = 'none' | 'track' | 'key';

/** none: not animated; track: animated but no key on this frame; key: a key on this frame. */
export function keyState(shape: ShapeData, path: PropertyPath, frame: number): KeyState {
  const track = shape.tracks?.[path];
  if (!track || track.length === 0) return 'none';
  return track.some((key) => key.frame === frame) ? 'key' : 'track';
}

function withTrack(shape: ShapeData, path: PropertyPath, track: readonly Keyframe[] | null): ShapeData {
  const tracks: Record<PropertyPath, readonly Keyframe[]> = { ...shape.tracks };
  if (track) tracks[path] = track;
  else delete tracks[path];
  const next: ShapeData = { ...shape, tracks };
  if (Object.keys(tracks).length === 0) delete (next as { tracks?: Tracks }).tracks;
  return next;
}

/** Colors are stored in tracks as hex, so they can be tweened. */
function keyValue(spec: PropertySpec, value: TrackValue): TrackValue {
  if ((spec.kind === 'color' || spec.kind === 'face') && typeof value === 'string') {
    const color = parseCssColor(value);
    if (color) return hexOf(color);
  }
  return value;
}

/** Adds or replaces the key at `frame`. A new key eases like the key before it. */
export function setKey(shape: ShapeData, path: PropertyPath, frame: number, value: TrackValue): ShapeData {
  const spec = specFor(shape, path);
  const track = shape.tracks?.[path] ?? [];
  const existing = track.find((key) => key.frame === frame);
  const before = [...track].reverse().find((key) => key.frame < frame);
  const key: Keyframe = {
    frame,
    value: keyValue(spec, value),
    easing: existing?.easing ?? before?.easing ?? DEFAULT_EASING,
  };
  if (existing && existing.value === key.value) return shape;
  const next = [...track.filter((k) => k.frame !== frame), key].sort((a, b) => a.frame - b.frame);
  return withTrack(shape, path, next);
}

/**
 * Removes the key at `frame`. Removing the last key removes the track and
 * keeps the value it had at that frame, so nothing jumps.
 */
export function removeKey(shape: ShapeData, path: PropertyPath, frame: number): ShapeData {
  const track = shape.tracks?.[path];
  if (!track?.some((key) => key.frame === frame)) return shape;
  const rest = track.filter((key) => key.frame !== frame);
  if (rest.length > 0) return withTrack(shape, path, rest);
  return withTrack(writeBase(shape, path, valueAt(shape, path, frame)), path, null);
}

/**
 * The keyframe button for one or more properties (Position's button keys x,
 * y and z together): if every one has a key on this frame, they are removed;
 * otherwise each gets a key holding its current value.
 */
export function toggleKeys(shape: ShapeData, paths: readonly PropertyPath[], frame: number): ShapeData {
  const allKeyed = paths.every((path) => keyState(shape, path, frame) === 'key');
  return paths.reduce(
    (next, path) =>
      allKeyed ? removeKey(next, path, frame) : setKey(next, path, frame, valueAt(shape, path, frame)),
    shape,
  );
}

/** The button state for several properties together; 'mixed' when they differ. */
export function groupKeyState(shape: ShapeData, paths: readonly PropertyPath[], frame: number): KeyState | 'mixed' {
  const states = new Set(paths.map((path) => keyState(shape, path, frame)));
  return states.size === 1 ? [...states][0] : 'mixed';
}

/** A patch as property paths and values (only the parts it sets). */
function flatten(patch: ShapePatch): [PropertyPath, TrackValue | import('./types').PropValue][] {
  const entries: [PropertyPath, TrackValue | import('./types').PropValue][] = [];
  for (const key of ['translate', 'rotate'] as const) {
    const vector = patch[key];
    if (vector) for (const [axis, value] of Object.entries(vector)) if (value !== undefined) entries.push([`${key}.${axis}`, value]);
  }
  if (patch.scale !== undefined) entries.push(['scale', patch.scale]);
  if (patch.opacity !== undefined) entries.push(['opacity', patch.opacity]);
  if (patch.props) for (const [key, value] of Object.entries(patch.props)) entries.push([`props.${key}`, value]);
  return entries;
}

const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

/**
 * An edit made while the playhead is on `frame`. Only properties whose value
 * actually changes are touched (the gizmo sends the whole position even when
 * dragging one axis). An animated property gets a key at this frame; any
 * other property changes for the whole animation.
 */
export function editAtFrame(shape: ShapeData, patch: ShapePatch, frame: number): ShapeData {
  let next = patch.name !== undefined && patch.name !== shape.name ? { ...shape, name: patch.name } : shape;
  for (const [path, value] of flatten(patch)) {
    const spec = propertySpec(shape.type, path);
    if (!spec) {
      next = writeBase(next, path, value); // not animatable (e.g. a Shape's path)
      continue;
    }
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') continue;
    if (same(valueAt(shape, path, frame), value)) continue;
    next = next.tracks?.[path] ? setKey(next, path, frame, value) : writeBase(next, path, value);
  }
  return next;
}
