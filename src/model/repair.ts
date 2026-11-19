import { propertiesOf, readBase, writeBase, type PropertySpec } from './animatable';
import { readCurve } from './easing';
import { clampTo, FPS, LENGTH, MAX_FRAME, PICTURE_SIZE, type NumberLimits } from './limits';
import { cleanName } from './names';
import { getShapeTypeDef } from './shapeTypes';
import {
  EASINGS,
  type CameraData,
  type Easing,
  type Keyframe,
  type PropertyPath,
  type Scene,
  type SceneObject,
  type Tracks,
} from './types';

/**
 * Keeps a scene within the editor's limits (limits.ts), so whatever the
 * editor holds can be drawn, saved and opened again. Every edit goes through
 * it (see state/history.ts applyCommand), and so does every scene file.
 *
 * - Numbers are clamped to their property's limits, and whole-number ones
 *   rounded. One that isn't a number at all (NaN, Infinity) gets the value it
 *   had before the edit, or else its default.
 * - Keys stay on whole frames from 0 to MAX_FRAME, with a known easing; a key
 *   whose value isn't a number is dropped.
 * - The frame rate and length stay within their limits.
 * - Names are cleaned (names.ts); an empty one keeps the old name, or the id.
 *
 * Only objects that differ from `before` (by identity) are looked at, which
 * keeps dragging cheap. Nothing that's already fine is copied: if nothing
 * needed fixing, the very same scene comes back.
 */
export function repairScene(scene: Scene, before?: Scene): Scene {
  const old = new Map<string, SceneObject>();
  const unchanged = new Set<SceneObject>();
  if (before) {
    for (const object of [...before.shapes, ...before.groups, ...before.cameras]) {
      old.set(object.id, object);
      unchanged.add(object);
    }
  }
  const fix = <T extends SceneObject>(list: readonly T[]): readonly T[] => {
    let changed = false;
    const fixed = list.map((object) => {
      if (unchanged.has(object)) return object;
      // The same object before the edit: same id and type (a loaded scene can reuse an id for another kind).
      const previous = old.get(object.id);
      const repaired = repairObject(object, previous?.type === object.type ? (previous as T) : undefined);
      if (repaired !== object) changed = true;
      return repaired;
    });
    return changed ? fixed : list;
  };

  const shapes = fix(scene.shapes);
  const groups = fix(scene.groups);
  const cameras = fix(scene.cameras);
  const settings = repairSettings(scene.settings, before?.settings);
  if (shapes === scene.shapes && groups === scene.groups && cameras === scene.cameras && settings === scene.settings) {
    return scene;
  }
  return { ...scene, settings, shapes, groups, cameras };
}

function repairSettings(settings: Scene['settings'], before?: Scene['settings']): Scene['settings'] {
  if (settings === before) return settings;
  const fps = clampTo(settings.fps, FPS, before?.fps ?? FPS.min);
  const duration = clampTo(settings.duration, LENGTH, before?.duration ?? LENGTH.min);
  return fps === settings.fps && duration === settings.duration ? settings : { ...settings, fps, duration };
}

/** A property's default, for a value that was never a number. */
function defaultOf(object: SceneObject, path: PropertyPath): number {
  if (path.startsWith('props.') && object.type !== 'Camera' && object.type !== 'Group') {
    const value = getShapeTypeDef(object.type).defaults[path.slice('props.'.length)];
    return typeof value === 'number' ? value : 0;
  }
  if (path === 'scale' || path === 'opacity') return 1;
  if (path === 'viewSpan') return 20;
  return 0;
}

const limitsOf = (spec: PropertySpec): NumberLimits => ({
  min: spec.min ?? -Infinity,
  max: spec.max ?? Infinity,
  integer: spec.integer,
});

function repairObject<T extends SceneObject>(object: T, before: T | undefined): T {
  let fixed = object;

  const name = cleanName(object.name);
  if (name !== object.name) fixed = { ...fixed, name: name || before?.name || object.id };

  for (const spec of propertiesOf(object.type)) {
    if (spec.kind !== 'number') continue;
    const value = readBase(fixed, spec.path);
    if (typeof value !== 'number') continue;
    const previous = before ? readBase(before, spec.path) : undefined;
    const fallback = typeof previous === 'number' && Number.isFinite(previous) ? previous : defaultOf(object, spec.path);
    const clamped = clampTo(value, limitsOf(spec), clampTo(fallback, limitsOf(spec), 0));
    if (clamped !== value) fixed = writeBase(fixed, spec.path, clamped);
  }

  if (fixed.type === 'Camera') {
    const camera = fixed as CameraData;
    const width = clampTo(camera.width, PICTURE_SIZE, (before as CameraData | undefined)?.width ?? 512);
    const height = clampTo(camera.height, PICTURE_SIZE, (before as CameraData | undefined)?.height ?? 512);
    if (width !== camera.width || height !== camera.height) fixed = { ...fixed, width, height };
  }

  if (fixed.tracks && fixed.tracks !== before?.tracks) {
    const tracks = repairTracks(fixed, fixed.tracks);
    if (tracks !== fixed.tracks) {
      fixed = tracks
        ? { ...fixed, tracks }
        : (Object.fromEntries(Object.entries(fixed).filter(([key]) => key !== 'tracks')) as T);
    }
  }
  return fixed;
}

const isEasing = (easing: unknown): easing is Easing =>
  (EASINGS as readonly unknown[]).includes(easing) || readCurve(easing) !== null;

const FRAMES: NumberLimits = { min: 0, max: MAX_FRAME, integer: true };

/** The tracks with every key fixed; the same object if none needed it, undefined if none are left. */
function repairTracks(object: SceneObject, tracks: Tracks): Tracks | undefined {
  let changed = false;
  const fixed: Record<PropertyPath, readonly Keyframe[]> = {};
  for (const [path, keys] of Object.entries(tracks)) {
    const spec = propertiesOf(object.type).find((s) => s.path === path);
    const repaired = spec ? repairKeys(keys, spec) : [];
    if (repaired !== keys) changed = true;
    if (repaired.length > 0) fixed[path] = repaired;
  }
  if (!changed) return tracks;
  return Object.keys(fixed).length > 0 ? fixed : undefined;
}

function repairKeys(keys: readonly Keyframe[], spec: PropertySpec): readonly Keyframe[] {
  let changed = false;
  const landing = new Map<number, Keyframe>();
  for (const key of keys) {
    if (!Number.isFinite(key.frame) || (spec.kind === 'number' && (typeof key.value !== 'number' || !Number.isFinite(key.value)))) {
      changed = true;
      continue;
    }
    const frame = clampTo(key.frame, FRAMES, 0);
    const value = spec.kind === 'number' ? clampTo(key.value as number, limitsOf(spec), 0) : key.value;
    const easing = isEasing(key.easing) ? key.easing : 'easeInOut';
    if (frame !== key.frame || value !== key.value || easing !== key.easing || landing.has(frame)) changed = true;
    landing.set(frame, frame === key.frame && value === key.value && easing === key.easing ? key : { frame, value, easing });
  }
  if (!changed) {
    // Already fine, unless out of order.
    for (let i = 1; i < keys.length; i++) if (keys[i].frame < keys[i - 1].frame) changed = true;
    if (!changed) return keys;
  }
  return [...landing.values()].sort((a, b) => a.frame - b.frame);
}
