import type { CameraData, Vec3 } from '../model/types';
import { pixelsPerUnit, type FreeView } from '../viewport/freeView';
import { Zdog } from '../zdog';

/**
 * Everything needed to draw the scene into a picture: how the world is
 * turned, which world point sits at the picture's center, the scale, and the
 * picture's size. The editor's free view and scene cameras both become one.
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

const DEG_TO_RAD = Math.PI / 180;

/**
 * The editor's free view, fitted to a `width` x `height` picture the same
 * way the viewport fits its column. Null if the size isn't usable.
 */
export function viewFromFreeView(view: FreeView, width: number, height: number): ViewSpec | null {
  const ppu = pixelsPerUnit(width, height, view);
  if (ppu === null) return null;
  return {
    rotate: { x: view.rotate.x, y: view.rotate.y, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    pixelsPerUnit: ppu,
    width,
    height,
  };
}

/**
 * A camera's own picture: its output size, with its view span across the
 * shorter side. (Animated cameras: pass the camera as posed on the frame.)
 */
export function viewFromCamera(camera: CameraData): ViewSpec {
  const { rotate, width, height } = camera;
  return {
    rotate: { x: rotate.x * DEG_TO_RAD, y: rotate.y * DEG_TO_RAD, z: rotate.z * DEG_TO_RAD },
    target: { ...camera.target },
    pixelsPerUnit: Math.min(width, height) / camera.viewSpan,
    width,
    height,
  };
}

export interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Space kept around a camera's picture when it is shown in the viewport. */
export const LOOK_THROUGH_MARGIN = 16;

/**
 * Where a camera's picture sits when looking through it in an area (the
 * viewport): as large as fits, centered, with the camera's own shape. The
 * rest of the area is outside the picture (shown darkened).
 */
export function cameraFrame(camera: CameraData, areaWidth: number, areaHeight: number): FrameRect {
  const room = { width: Math.max(1, areaWidth - 2 * LOOK_THROUGH_MARGIN), height: Math.max(1, areaHeight - 2 * LOOK_THROUGH_MARGIN) };
  const scale = Math.min(room.width / camera.width, room.height / camera.height);
  const width = camera.width * scale;
  const height = camera.height * scale;
  return { left: (areaWidth - width) / 2, top: (areaHeight - height) / 2, width, height };
}

/**
 * The view through a camera, drawn into a whole area (the viewport): the
 * camera's picture fills `cameraFrame`, and what lies beyond it is drawn too.
 * Scaled down from the camera's own picture, it shows exactly what the camera
 * exports.
 */
export function lookThroughView(camera: CameraData, areaWidth: number, areaHeight: number): ViewSpec {
  const own = viewFromCamera(camera);
  const frame = cameraFrame(camera, areaWidth, areaHeight);
  return { ...own, pixelsPerUnit: own.pixelsPerUnit * (frame.width / camera.width), width: areaWidth, height: areaHeight };
}

/** Rotates `v` the way zdog does (z, then y, then x), angles in radians. */
export function turn(v: Vec3, rotate: Vec3): Vec3 {
  const out = new Zdog.Vector(v);
  out.rotate(rotate);
  return { x: out.x, y: out.y, z: out.z };
}

/** Undoes `turn`: one axis at a time, in the reverse order. */
export function unturn(v: Vec3, rotate: Vec3): Vec3 {
  const out = new Zdog.Vector(v);
  out.rotate({ x: -rotate.x, y: 0, z: 0 });
  out.rotate({ x: 0, y: -rotate.y, z: 0 });
  out.rotate({ x: 0, y: 0, z: -rotate.z });
  return { x: out.x, y: out.y, z: out.z };
}

/**
 * How far the world must move so the view's target lands at the center:
 * zdog applies a root's rotation before its translation, so this is minus
 * the turned target.
 */
export function rootTranslate(view: Pick<ViewSpec, 'rotate' | 'target'>): Vec3 {
  const t = turn(view.target, view.rotate);
  return { x: -t.x, y: -t.y, z: -t.z };
}
