import { removeKey } from './animation';
import type { Easing, Keyframe, PropertyPath, Scene, ShapeData, Tracks } from './types';

/**
 * Edits on many keyframes at once, as the timeline makes them: moving keys
 * in time, deleting them, changing their easing, and rescaling everything
 * for a new frame rate. Pure functions on immutable data.
 */

/** One keyframe: a shape, one of its animated properties, and a frame. */
export interface KeyRef {
  readonly shapeId: string;
  readonly path: PropertyPath;
  readonly frame: number;
}

export const keyRefId = (ref: KeyRef): string => `${ref.shapeId}|${ref.path}|${ref.frame}`;

export function keyExists(scene: Scene, ref: KeyRef): boolean {
  const shape = scene.shapes.find((s) => s.id === ref.shapeId);
  return shape?.tracks?.[ref.path]?.some((key) => key.frame === ref.frame) ?? false;
}

/** The refs grouped by shape id, then by property. */
function byShapeAndPath(refs: readonly KeyRef[]): Map<string, Map<PropertyPath, Set<number>>> {
  const grouped = new Map<string, Map<PropertyPath, Set<number>>>();
  for (const ref of refs) {
    let paths = grouped.get(ref.shapeId);
    if (!paths) grouped.set(ref.shapeId, (paths = new Map()));
    let frames = paths.get(ref.path);
    if (!frames) paths.set(ref.path, (frames = new Set()));
    frames.add(ref.frame);
  }
  return grouped;
}

function replaceShapes(scene: Scene, changed: ReadonlyMap<string, ShapeData>): Scene {
  if (changed.size === 0) return scene;
  return { ...scene, shapes: scene.shapes.map((shape) => changed.get(shape.id) ?? shape) };
}

function withTracks(shape: ShapeData, tracks: Record<PropertyPath, readonly Keyframe[]>): ShapeData {
  return { ...shape, tracks: tracks as Tracks };
}

/**
 * The keys in `refs` moved by `delta` frames (never before frame 0). A moved
 * key replaces a key it lands on; if moved keys land on one frame, the one
 * that was later wins. Works from `origin`, the shapes as they were when the
 * drag started, so a drag can go back and forth without losing keys it
 * passed over. Returns the shapes that changed and where the keys ended up.
 */
export function moveKeys(
  origin: readonly ShapeData[],
  refs: readonly KeyRef[],
  delta: number,
): { readonly shapes: ReadonlyMap<string, ShapeData>; readonly refs: readonly KeyRef[] } {
  const shapes = new Map<string, ShapeData>();
  const moved: KeyRef[] = [];
  for (const [shapeId, paths] of byShapeAndPath(refs)) {
    const shape = origin.find((s) => s.id === shapeId);
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
      for (const frame of landing.keys()) moved.push({ shapeId, path, frame });
    }
    shapes.set(shapeId, withTracks(shape, tracks));
  }
  return { shapes, refs: moved };
}

/** Applies `moveKeys` to the current scene (other changes since the drag began are kept). */
export function moveKeysInScene(scene: Scene, origin: readonly ShapeData[], refs: readonly KeyRef[], delta: number): Scene {
  const { shapes } = moveKeys(origin, refs, delta);
  const changed = new Map<string, ShapeData>();
  for (const [id, moved] of shapes) {
    const current = scene.shapes.find((s) => s.id === id);
    if (current && current.tracks !== moved.tracks) changed.set(id, { ...current, tracks: moved.tracks });
  }
  return replaceShapes(scene, changed);
}

/**
 * Deletes keys. A property whose last key goes keeps the value it had, so
 * nothing jumps (see removeKey).
 */
export function deleteKeys(scene: Scene, refs: readonly KeyRef[]): Scene {
  const changed = new Map<string, ShapeData>();
  for (const [shapeId, paths] of byShapeAndPath(refs)) {
    let shape = scene.shapes.find((s) => s.id === shapeId);
    if (!shape) continue;
    for (const [path, frames] of paths) for (const frame of frames) shape = removeKey(shape, path, frame);
    changed.set(shapeId, shape);
  }
  return replaceShapes(scene, changed);
}

export function setKeysEasing(scene: Scene, refs: readonly KeyRef[], easing: Easing): Scene {
  const changed = new Map<string, ShapeData>();
  for (const [shapeId, paths] of byShapeAndPath(refs)) {
    const shape = scene.shapes.find((s) => s.id === shapeId);
    if (!shape?.tracks) continue;
    const tracks: Record<PropertyPath, readonly Keyframe[]> = { ...shape.tracks };
    let any = false;
    for (const [path, frames] of paths) {
      const track = tracks[path];
      if (!track) continue;
      tracks[path] = track.map((key) => {
        if (!frames.has(key.frame) || key.easing === easing) return key;
        any = true;
        return { ...key, easing };
      });
    }
    if (any) changed.set(shapeId, withTracks(shape, tracks));
  }
  return replaceShapes(scene, changed);
}

/** The easing the keys share, 'mixed' if they differ, or null if there are none. */
export function sharedEasing(scene: Scene, refs: readonly KeyRef[]): Easing | 'mixed' | null {
  const easings = new Set<Easing>();
  for (const ref of refs) {
    const key = scene.shapes.find((s) => s.id === ref.shapeId)?.tracks?.[ref.path]?.find((k) => k.frame === ref.frame);
    if (key) easings.add(key.easing);
  }
  if (easings.size === 0) return null;
  return easings.size === 1 ? [...easings][0] : 'mixed';
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
  const shapes = scene.shapes.map((shape) => {
    if (!shape.tracks) return shape;
    const tracks: Record<PropertyPath, readonly Keyframe[]> = {};
    for (const [path, track] of Object.entries(shape.tracks)) {
      const landing = new Map<number, Keyframe>();
      for (const key of track) landing.set(scale(key.frame), { ...key, frame: scale(key.frame) });
      tracks[path] = [...landing.values()];
    }
    return withTracks(shape, tracks);
  });
  return {
    ...scene,
    settings: { ...scene.settings, fps, duration: Math.max(1, scale(duration)) },
    shapes,
  };
}
