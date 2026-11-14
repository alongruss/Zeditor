import * as Zdog from 'zdog';
import type { Vec3 } from '../model/types';

/**
 * Gizmo math: where its handles appear on screen, and what a drag on them
 * does. Pure functions, so they can be tested without a browser.
 *
 * Screen coordinates are pixels from the viewport's top-left, x right and
 * y down, exactly as zdog draws the scene: a world point is turned by the
 * camera, multiplied by the zoom, and offset from the viewport's center.
 */

export type Axis = 'x' | 'y' | 'z';
export const AXES: readonly Axis[] = ['x', 'y', 'z'];

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Length of a move arrow on screen when it lies flat to the screen. */
export const ARROW_LENGTH_PX = 84;
/** Radius of a rotation ring on screen when it faces the camera. */
export const RING_RADIUS_PX = 58;
/** Points per rotation ring outline. */
export const RING_SEGMENTS = 64;
/**
 * A move arrow shorter than this fraction of its full length points almost
 * straight at the camera. Dragging along it would be wild (and divide by
 * nearly zero), so it is switched off.
 */
export const MIN_ARROW_FRACTION = 0.15;
/** A rotation ring seen this close to edge-on is switched off, for the same reason. */
export const MIN_RING_FACING = 0.05;
/** Shift snaps rotation to multiples of this many degrees. */
export const ROTATION_SNAP_DEG = 15;

/** The camera and viewport: everything needed to place world points on screen. */
export interface ViewTransform {
  readonly width: number;
  readonly height: number;
  /** Screen pixels per world unit. */
  readonly zoom: number;
  /** Camera rotation in radians. */
  readonly rotate: { readonly x: number; readonly y: number };
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

const UNIT: Readonly<Record<Axis, Vec3>> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

/** Rotates `v` the way zdog does (z first, then y, then x), angles in radians. */
function turn(v: Vec3, rotation: Partial<Vec3>): Vec3 {
  const out = new Zdog.Vector(v);
  out.rotate({ x: rotation.x ?? 0, y: rotation.y ?? 0, z: rotation.z ?? 0 });
  return { x: out.x, y: out.y, z: out.z };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const times = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Where world point `p` is drawn. */
export function project(p: Vec3, view: ViewTransform): ScreenPoint {
  const v = turn(p, { x: view.rotate.x, y: view.rotate.y });
  return { x: view.width / 2 + v.x * view.zoom, y: view.height / 2 + v.y * view.zoom };
}

/** How a world direction looks on screen, in pixels per world unit. */
function onScreen(direction: Vec3, view: ViewTransform): ScreenPoint {
  const v = turn(direction, { x: view.rotate.x, y: view.rotate.y });
  return { x: v.x * view.zoom, y: v.y * view.zoom };
}

// ----- move arrows -----

/** True when the world `axis` shows enough on screen to drag along. */
export function arrowEnabled(axis: Axis, view: ViewTransform): boolean {
  const a = onScreen(UNIT[axis], view);
  return Math.hypot(a.x, a.y) >= MIN_ARROW_FRACTION * view.zoom;
}

/** Screen points of a move arrow, from the shape's origin to its tip. */
export function arrowPoints(origin: Vec3, axis: Axis, view: ViewTransform): [ScreenPoint, ScreenPoint] {
  const tip = add(origin, times(UNIT[axis], ARROW_LENGTH_PX / view.zoom));
  return [project(origin, view), project(tip, view)];
}

/**
 * The shape's position after dragging a move arrow by `drag` pixels: the drag
 * is projected onto the axis as it appears on screen, turned into world
 * units, and added to the position at the start of the drag. So the point
 * you grabbed stays under the pointer, from any camera angle.
 *
 * Never returns NaN: an arrow pointing (almost) at the camera does nothing.
 * With `snap`, the coordinate lands on a whole unit.
 */
export function moveAlongAxis(
  start: Vec3,
  axis: Axis,
  drag: ScreenPoint,
  view: ViewTransform,
  snap: boolean,
): Vec3 {
  if (!arrowEnabled(axis, view)) return start;
  const a = onScreen(UNIT[axis], view);
  const units = (drag.x * a.x + drag.y * a.y) / (a.x * a.x + a.y * a.y);
  const raw = start[axis] + units;
  return { ...start, [axis]: snap ? Math.round(raw) : roundTo(raw, 3) };
}

// ----- rotation rings -----

/**
 * The rotations zdog applies *after* the given axis's own rotation. A shape's
 * rotation is applied z first, then y, then x; so the X ring turns around the
 * fixed world X axis, the Y ring is tilted by the X rotation, and the Z ring
 * by both. Drawing each ring in this frame means it turns the shape exactly
 * around the axis it shows, while still editing the plain X/Y/Z values the
 * Inspector shows.
 */
function ringFrame(axis: Axis, rotateDeg: Vec3): Partial<Vec3> {
  if (axis === 'x') return {};
  if (axis === 'y') return { x: rotateDeg.x * DEG };
  return { x: rotateDeg.x * DEG, y: rotateDeg.y * DEG };
}

/** Two radius vectors of a ring, a quarter turn apart in the direction a positive rotation goes. */
function ringBasis(axis: Axis, rotateDeg: Vec3): [Vec3, Vec3] {
  const first = axis === 'x' ? UNIT.y : UNIT.x;
  const second = turn(first, { [axis]: Math.PI / 2 });
  const frame = ringFrame(axis, rotateDeg);
  return [turn(first, frame), turn(second, frame)];
}

/** Screen outline of a rotation ring around `origin`, as a closed list of points. */
export function ringPoints(origin: Vec3, axis: Axis, rotateDeg: Vec3, view: ViewTransform): ScreenPoint[] {
  const [a, b] = ringBasis(axis, rotateDeg);
  const radius = RING_RADIUS_PX / view.zoom;
  const points: ScreenPoint[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const angle = (i / RING_SEGMENTS) * TAU;
    const offset = add(times(a, Math.cos(angle) * radius), times(b, Math.sin(angle) * radius));
    points.push(project(add(origin, offset), view));
  }
  return points;
}

/**
 * Which way round the screen a positive rotation on this ring goes: +1 when
 * it goes the way `screenAngle` increases (clockwise on screen), -1 the other
 * way, and 0 when the ring is seen (almost) edge-on and is switched off.
 */
export function ringDirection(axis: Axis, rotateDeg: Vec3, view: ViewTransform): -1 | 0 | 1 {
  const [a, b] = ringBasis(axis, rotateDeg);
  const sa = onScreen(a, view);
  const sb = onScreen(b, view);
  // For unit vectors this is how squarely the ring faces the camera, from -1 to 1.
  const facing = (sa.x * sb.y - sa.y * sb.x) / (view.zoom * view.zoom);
  if (Math.abs(facing) < MIN_RING_FACING) return 0;
  return facing > 0 ? 1 : -1;
}

/** Angle of `point` around `center` on screen, in radians (increases clockwise, as y points down). */
export function screenAngle(center: ScreenPoint, point: ScreenPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

/** The smallest signed turn from angle `from` to angle `to`, in (-π, π]. */
export function angleBetween(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta <= -Math.PI) delta += TAU;
  return delta;
}

/**
 * The rotation value (degrees) after sweeping `swept` radians around the
 * shape's center on a ring whose direction is `direction`. With `snap`, it
 * lands on a multiple of 15°.
 */
export function ringRotation(startDeg: number, swept: number, direction: -1 | 0 | 1, snap: boolean): number {
  const raw = startDeg + (direction * swept) / DEG;
  return snap ? Math.round(raw / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG : roundTo(raw, 2);
}
