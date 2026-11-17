import { sameEasing } from './easing';
import { propertySpec } from './animatable';
import { removeKey } from './animation';
import { findObject, replaceObjects } from './scene';
import type { Easing, Keyframe, PropertyPath, Scene, SceneObject, Tracks } from './types';

/**
 * Edits on many keyframes at once, as the timeline makes them: moving keys
 * in time, deleting them, changing their easing, and rescaling everything
 * for a new frame rate. Pure functions on immutable data.
 */

/** One keyframe: a shape or camera, one of its animated properties, and a frame. */
export interface KeyRef {
  readonly objectId: string;
  readonly path: PropertyPath;
  readonly frame: number;
}

export const keyRefId = (ref: KeyRef): string => `${ref.objectId}|${ref.path}|${ref.frame}`;

export function keyExists(scene: Scene, ref: KeyRef): boolean {
  return findObject(scene, ref.objectId)?.tracks?.[ref.path]?.some((key) => key.frame === ref.frame) ?? false;
}

/** The refs grouped by shape id, then by property. */
function byObjectAndPath(refs: readonly KeyRef[]): Map<string, Map<PropertyPath, Set<number>>> {
  const grouped = new Map<string, Map<PropertyPath, Set<number>>>();
  for (const ref of refs) {
    let paths = grouped.get(ref.objectId);
    if (!paths) grouped.set(ref.objectId, (paths = new Map()));
    let frames = paths.get(ref.path);
    if (!frames) paths.set(ref.path, (frames = new Set()));
    frames.add(ref.frame);
  }
  return grouped;
}

function withTracks<T extends SceneObject>(object: T, tracks: Record<PropertyPath, readonly Keyframe[]>): T {
  return { ...object, tracks: tracks as Tracks };
}

/**
 * The keys in `refs` moved by `delta` frames (never before frame 0). A moved
 * key replaces a key it lands on; if moved keys land on one frame, the one
 * that was later wins. Works from `origin`, the shapes as they were when the
 * drag started, so a drag can go back and forth without losing keys it
 * passed over. Returns the shapes that changed and where the keys ended up.
 */
export function moveKeys(
  origin: readonly SceneObject[],
  refs: readonly KeyRef[],
  delta: number,
): { readonly shapes: ReadonlyMap<string, SceneObject>; readonly refs: readonly KeyRef[] } {
  const shapes = new Map<string, SceneObject>();
  const moved: KeyRef[] = [];
  for (const [objectId, paths] of byObjectAndPath(refs)) {
    const shape = origin.find((o) => o.id === objectId);
    if (!shape?.tracks) continue;
    const tracks: Record<PropertyPath, readonly Keyframe[]> = { ...shape.tracks };
    for (const [path, frames] of paths) {
      const track = shape.tracks[path];
      if (!track) continue;
      const landing = new Map<number, Keyframe>();
      for (const key of track) {
        if (!frames.has(key.frame)) continue;
        const frame = Math.max(0, key.frame + delta);
        landing.set(frame, { ...key, frame }); // in frame order, so a later key overwrites
      }
      const staying = track.filter((key) => !frames.has(key.frame) && !landing.has(key.frame));
      tracks[path] = [...staying, ...landing.values()].sort((a, b) => a.frame - b.frame);
      for (const frame of landing.keys()) moved.push({ objectId, path, frame });
    }
    shapes.set(objectId, withTracks(shape, tracks));
  }
  return { shapes, refs: moved };
}

/** Applies `moveKeys` to the current scene (other changes since the drag began are kept). */
export function moveKeysInScene(scene: Scene, origin: readonly SceneObject[], refs: readonly KeyRef[], delta: number): Scene {
  const { shapes } = moveKeys(origin, refs, delta);
  const changed = new Map<string, SceneObject>();
  for (const [id, moved] of shapes) {
    const current = findObject(scene, id);
    if (current && current.tracks !== moved.tracks) changed.set(id, { ...current, tracks: moved.tracks });
  }
  return replaceObjects(scene, changed);
}

/**
 * Deletes keys. A property whose last key goes keeps the value it had, so
 * nothing jumps (see removeKey).
 */
export function deleteKeys(scene: Scene, refs: readonly KeyRef[]): Scene {
  const changed = new Map<string, SceneObject>();
  for (const [objectId, paths] of byObjectAndPath(refs)) {
    let shape = findObject(scene, objectId);
    if (!shape) continue;
    for (const [path, frames] of paths) for (const frame of frames) shape = removeKey(shape, path, frame);
    changed.set(objectId, shape);
  }
  return replaceObjects(scene, changed);
}

export function setKeysEasing(scene: Scene, refs: readonly KeyRef[], easing: Easing): Scene {
  const changed = new Map<string, SceneObject>();
  for (const [objectId, paths] of byObjectAndPath(refs)) {
    const shape = findObject(scene, objectId);
    if (!shape?.tracks) continue;
    const tracks: Record<PropertyPath, readonly Keyframe[]> = { ...shape.tracks };
    let any = false;
    for (const [path, frames] of paths) {
      const track = tracks[path];
      if (!track) continue;
      tracks[path] = track.map((key) => {
        if (!frames.has(key.frame) || sameEasing(key.easing, easing)) return key;
        any = true;
        return { ...key, easing };
      });
    }
    if (any) changed.set(objectId, withTracks(shape, tracks));
  }
  return replaceObjects(scene, changed);
}

/** The easing the keys share, 'mixed' if they differ, or null if there are none. */
export function sharedEasing(scene: Scene, refs: readonly KeyRef[]): Easing | 'mixed' | null {
  let shared: Easing | null = null;
  for (const ref of refs) {
    const key = findObject(scene, ref.objectId)?.tracks?.[ref.path]?.find((k) => k.frame === ref.frame);
    if (!key) continue;
    if (shared === null) shared = key.easing;
    else if (!sameEasing(shared, key.easing)) return 'mixed';
  }
  return shared;
}

/**
 * The scene at a new frame rate with the same timing in seconds: every key
 * and the length are rescaled to the new rate and rounded to whole frames.
 * Keys that round onto the same frame keep the later one.
 */
export function retime(scene: Scene, fps: number): Scene {
  const { fps: oldFps, duration } = scene.settings;
  if (fps === oldFps) return scene;
  const scale = (frame: number) => Math.round((frame * fps) / oldFps);
  const rescaled = <T extends SceneObject>(object: T): T => {
    if (!object.tracks) return object;
    const tracks: Record<PropertyPath, readonly Keyframe[]> = {};
    for (const [path, track] of Object.entries(object.tracks)) {
      const landing = new Map<number, Keyframe>();
      for (const key of track) landing.set(scale(key.frame), { ...key, frame: scale(key.frame) });
      tracks[path] = [...landing.values()];
    }
    return withTracks(object, tracks);
  };
  return {
    ...scene,
    settings: { ...scene.settings, fps, duration: Math.max(1, scale(duration)) },
    shapes: scene.shapes.map(rescaled),
    groups: scene.groups.map(rescaled),
    cameras: scene.cameras.map(rescaled),
  };
}

// ----- copy and paste -----

/** A copied key: its property, how many frames after the first copied key it was, and its value and easing. */
export interface CopiedKey {
  readonly path: PropertyPath;
  readonly offset: number;
  readonly value: Keyframe['value'];
  readonly easing: Easing;
}

/** Keys copied from the timeline, per object they came from. */
export interface KeyClip {
  readonly sources: readonly { readonly objectId: string; readonly keys: readonly CopiedKey[] }[];
  /** How many keys in all. */
  readonly count: number;
}

/** The keys in `refs`, frames counted from the earliest one. Null if none of them exist. */
export function copyKeys(scene: Scene, refs: readonly KeyRef[]): KeyClip | null {
  const found: { objectId: string; key: Keyframe; path: PropertyPath }[] = [];
  for (const [objectId, paths] of byObjectAndPath(refs)) {
    const object = findObject(scene, objectId);
    for (const [path, frames] of paths) {
      for (const key of object?.tracks?.[path] ?? []) if (frames.has(key.frame)) found.push({ objectId, key, path });
    }
  }
  if (found.length === 0) return null;
  const first = Math.min(...found.map(({ key }) => key.frame));
  const sources = new Map<string, CopiedKey[]>();
  for (const { objectId, key, path } of found) {
    const keys = sources.get(objectId) ?? [];
    keys.push({ path, offset: key.frame - first, value: key.value, easing: key.easing });
    sources.set(objectId, keys);
  }
  return { sources: [...sources].map(([objectId, keys]) => ({ objectId, keys })), count: found.length };
}

/** Whether `object` can take a key copied from a `from` object's property (it has it, of the same kind). */
function accepts(object: SceneObject, from: SceneObject | undefined, path: PropertyPath): boolean {
  const spec = propertySpec(object.type, path);
  if (!spec) return false;
  const source = from && propertySpec(from.type, path);
  return !source || source.kind === spec.kind;
}

/**
 * Where pasted keys go: keys copied from one object go onto `selected` (a
 * single object) if it can take any of them; otherwise every key goes back
 * onto the object it came from.
 */
export function pasteTargets(scene: Scene, clip: KeyClip, selected: readonly string[]): Map<string, string> {
  const targets = new Map(clip.sources.map(({ objectId }) => [objectId, objectId]));
  if (clip.sources.length !== 1 || selected.length !== 1) return targets;
  const [{ objectId, keys }] = clip.sources;
  const target = findObject(scene, selected[0]);
  const from = findObject(scene, objectId);
  if (target && keys.some((key) => accepts(target, from, key.path))) targets.set(objectId, target.id);
  return targets;
}

export interface PasteResult {
  readonly scene: Scene;
  /** The keys as pasted. */
  readonly refs: readonly KeyRef[];
  /** Keys left out: past the last frame, or for a property the object doesn't have. */
  readonly pastEnd: number;
  readonly unsupported: number;
}

/**
 * Pastes `clip` with its first key on frame `at`, keeping the keys' spacing,
 * values and easing. A pasted key replaces a key on its frame. `targets`
 * says which object each source's keys go onto (see pasteTargets).
 */
export function pasteKeys(scene: Scene, clip: KeyClip, at: number, targets: ReadonlyMap<string, string>): PasteResult {
  const last = Math.max(0, scene.settings.duration - 1);
  const changed = new Map<string, SceneObject>();
  const refs: KeyRef[] = [];
  let pastEnd = 0;
  let unsupported = 0;
  for (const { objectId, keys } of clip.sources) {
    const targetId = targets.get(objectId) ?? objectId;
    let object = changed.get(targetId) ?? findObject(scene, targetId);
    const from = findObject(scene, objectId);
    for (const key of keys) {
      const frame = at + key.offset;
      if (!object || !accepts(object, from, key.path)) {
        unsupported += 1;
        continue;
      }
      if (frame > last) {
        pastEnd += 1;
        continue;
      }
      const track = object.tracks?.[key.path] ?? [];
      const pasted: Keyframe = { frame, value: key.value, easing: key.easing };
      const next = [...track.filter((k) => k.frame !== frame), pasted].sort((a, b) => a.frame - b.frame);
      object = withTracks(object, { ...object.tracks, [key.path]: next });
      refs.push({ objectId: targetId, path: key.path, frame });
    }
    if (object) changed.set(targetId, object);
  }
  return { scene: refs.length === 0 ? scene : replaceObjects(scene, changed), refs, pastEnd, unsupported };
}
