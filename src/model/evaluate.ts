import { writeBase } from './animatable';
import { valueAt } from './animation';
import type { Scene, SceneObject, ShapeData, TrackValue } from './types';

/**
 * The scene's pose at a frame: every animated property set to its value at
 * that frame. Everything that draws or exports the scene works from this.
 *
 * Shapes keep their identity whenever nothing about them changes: a shape
 * without animation is returned as is, and an animated shape gives back the
 * same object as last time if its values are the same (in a hold, or past its
 * last key). The viewport then skips rebuilding it.
 */

const memo = new WeakMap<SceneObject, { readonly values: readonly TrackValue[]; readonly pose: SceneObject }>();

const sameValues = (a: readonly TrackValue[], b: readonly TrackValue[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** A shape or camera as posed on `frame`. */
export function objectAtFrame<T extends SceneObject>(shape: T, frame: number): T {
  const tracks = shape.tracks;
  if (!tracks) return shape;
  const paths = Object.keys(tracks);
  if (paths.length === 0) return shape;

  const values = paths.map((path) => valueAt(shape, path, frame));
  const cached = memo.get(shape);
  if (cached && sameValues(cached.values, values)) return cached.pose as T;

  const pose = paths.reduce((posed, path, i) => writeBase(posed, path, values[i]), shape);
  memo.set(shape, { values, pose });
  return pose;
}

export const shapeAtFrame = (shape: ShapeData, frame: number): ShapeData => objectAtFrame(shape, frame);

export function sceneAtFrame(scene: Scene, frame: number): Scene {
  const shapes = scene.shapes.map((shape) => objectAtFrame(shape, frame));
  const groups = scene.groups.map((group) => objectAtFrame(group, frame));
  const cameras = scene.cameras.map((camera) => objectAtFrame(camera, frame));
  const same =
    shapes.every((s, i) => s === scene.shapes[i]) &&
    groups.every((g, i) => g === scene.groups[i]) &&
    cameras.every((c, i) => c === scene.cameras[i]);
  return same ? scene : { ...scene, shapes, groups, cameras };
}

/** True if anything in the scene is animated. */
export function isAnimated(scene: Scene): boolean {
  return [...scene.shapes, ...scene.groups, ...scene.cameras].some(
    (object) => object.tracks !== undefined && Object.keys(object.tracks).length > 0,
  );
}
