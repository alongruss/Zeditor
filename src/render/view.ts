import type { Vec3 } from '../model/types';
import { pixelsPerUnit, type Camera } from '../viewport/camera';

/**
 * Everything needed to draw the scene into a picture: how the world is
 * turned, which world point sits at the picture's center, the scale, and the
 * picture's size. The editor's view and (later) scene cameras both become one.
 */
export interface ViewSpec {
  /** Rotation of the whole world, in radians (zdog's root `rotate`). */
  readonly rotate: Vec3;
  /** The world point drawn at the center of the picture. */
  readonly target: Vec3;
  /** Screen pixels per world unit. */
  readonly pixelsPerUnit: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The editor's current view, fitted to a `width` x `height` picture the same
 * way the viewport fits its column. Null if the size isn't usable.
 */
export function viewFromCamera(camera: Camera, width: number, height: number): ViewSpec | null {
  const ppu = pixelsPerUnit(width, height, camera);
  if (ppu === null) return null;
  return {
    rotate: { x: camera.rotate.x, y: camera.rotate.y, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    pixelsPerUnit: ppu,
    width,
    height,
  };
}
