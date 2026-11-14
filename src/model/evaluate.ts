import { writeBase } from './animatable';
import { valueAt } from './animation';
import type { Scene, ShapeData, TrackValue } from './types';

/**
 * The scene's pose at a frame: every animated property set to its value at
 * that frame. Everything that draws or exports the scene works from this.
 *
 * Shapes keep their identity whenever nothing about them changes: a shape
 * without animation is returned as is, and an animated shape gives back the
 * same object as last time if its values are the same (in a hold, or past its
 * last key). The viewport then skips rebuilding it.
 */

const memo = new WeakMap<ShapeData, { readonly values: readonly TrackValue[]; readonly pose: ShapeData }>();

const sameValues = (a: readonly TrackValue[], b: readonly TrackValue[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

export function shapeAtFrame(shape: ShapeData, frame: number): ShapeData {
  const tracks = shape.tracks;
  if (!tracks) return shape;
  const paths = Object.keys(tracks);
  if (paths.length === 0) return shape;

  const values = paths.map((path) => valueAt(shape, path, frame));
  const cached = memo.get(shape);
  if (cached && sameValues(cached.values, values)) return cached.pose;

  const pose = paths.reduce((posed, path, i) => writeBase(posed, path, values[i]), shape);
  memo.set(shape, { values, pose });
  return pose;
}

export function sceneAtFrame(scene: Scene, frame: number): Scene {
  const shapes = scene.shapes.map((shape) => shapeAtFrame(shape, frame));
  return shapes.every((shape, i) => shape === scene.shapes[i]) ? scene : { ...scene, shapes };
}

/** True if anything in the scene is animated. */
export function isAnimated(scene: Scene): boolean {
  return scene.shapes.some((shape) => shape.tracks !== undefined && Object.keys(shape.tracks).length > 0);
}
