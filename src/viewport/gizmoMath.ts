import { Zdog } from '../zdog';
import { applyMatrix, compose, directionInto, eulerOf, IDENTITY, multiply, relativeTo, rotationMatrix, type Transform } from '../model/transform';
import type { Vec3 } from '../model/types';

/**
 * Inside a group, an object's own values are in its group's space: the
 * gizmo still drags along the world axes and shows rings where they turn
 * the object, then turns the change into the group's space. `parent` is the
 * group's transform as seen from the world (none, or identity, at the top).
 */
const isIdentity = (t: Transform | undefined): boolean =>
  !t ||
  (t.scale === 1 &&
    t.rotate.x === 0 &&
    t.rotate.y === 0 &&
    t.rotate.z === 0);

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
/** Size of a move arrow's head, in pixels. */
export const ARROW_HEAD_PX = 11;
/** Radius of a rotation ring on screen when it faces the camera. */
export const RING_RADIUS_PX = 58;
/**
 * How far any gizmo handle reaches from the shape's center on screen: an
 * arrow and its head. (Rings reach 58px, plus 7px of their grab stroke.)
 * Nothing else may cover this square, or a handle can't be grabbed.
 */
export const GIZMO_REACH_PX = ARROW_LENGTH_PX + ARROW_HEAD_PX;
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
  /** Rotation of the view in radians (z rolls it; the free view has none). */
  readonly rotate: { readonly x: number; readonly y: number; readonly z?: number };
  /** The world point at the center of the view (the origin if not given). */
  readonly target?: Vec3;
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
  const target = view.target ?? { x: 0, y: 0, z: 0 };
  const v = turn({ x: p.x - target.x, y: p.y - target.y, z: p.z - target.z }, view.rotate);
  return { x: view.width / 2 + v.x * view.zoom, y: view.height / 2 + v.y * view.zoom };
}

/**
 * The world point drawn at screen point `p`, on the plane through the view's
 * target that faces the view (the inverse of `project` for that plane). Used
 * to add a shape where you right-clicked.
 */
export function unproject(p: ScreenPoint, view: ViewTransform): Vec3 {
  const v = new Zdog.Vector({ x: (p.x - view.width / 2) / view.zoom, y: (p.y - view.height / 2) / view.zoom, z: 0 });
  // Undo `turn`: zdog rotates z, then y, then x, so go back x, y, z.
  v.rotate({ x: -view.rotate.x, y: 0, z: 0 });
  v.rotate({ x: 0, y: -view.rotate.y, z: 0 });
  v.rotate({ x: 0, y: 0, z: -(view.rotate.z ?? 0) });
  const target = view.target ?? { x: 0, y: 0, z: 0 };
  return { x: v.x + target.x, y: v.y + target.y, z: v.z + target.z };
}

/** How a world direction looks on screen, in pixels per world unit. */
function onScreen(direction: Vec3, view: ViewTransform): ScreenPoint {
  const v = turn(direction, view.rotate);
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
  parent?: Transform,
): Vec3 {
  if (!arrowEnabled(axis, view)) return start;
  const a = onScreen(UNIT[axis], view);
  const units = (drag.x * a.x + drag.y * a.y) / (a.x * a.x + a.y * a.y);
  if (isIdentity(parent)) {
    const raw = start[axis] + units;
    return { ...start, [axis]: snap ? Math.round(raw) : roundTo(raw, 3) };
  }
  // In a turned or scaled group: move along the world axis, written in the group's space.
  const local = directionInto(parent!, times(UNIT[axis], snap ? Math.round(units) : units));
  return { x: roundTo(start.x + local.x, 3), y: roundTo(start.y + local.y, 3), z: roundTo(start.z + local.z, 3) };
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

/**
 * Two radius vectors of a ring, a quarter turn apart in the direction a
 * positive rotation goes, in the world (turned by the group, if any).
 */
function ringBasis(axis: Axis, rotateDeg: Vec3, parent?: Transform): [Vec3, Vec3] {
  const first = axis === 'x' ? UNIT.y : UNIT.x;
  const second = turn(first, { [axis]: Math.PI / 2 });
  const frame = ringFrame(axis, rotateDeg);
  const inGroup = (v: Vec3) => (isIdentity(parent) ? v : applyMatrix(rotationMatrix(parent!.rotate), v));
  return [inGroup(turn(first, frame)), inGroup(turn(second, frame))];
}

/** Screen outline of a rotation ring around `origin` (a world point), as a closed list of points. */
export function ringPoints(origin: Vec3, axis: Axis, rotateDeg: Vec3, view: ViewTransform, parent?: Transform): ScreenPoint[] {
  const [a, b] = ringBasis(axis, rotateDeg, parent);
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
export function ringDirection(axis: Axis, rotateDeg: Vec3, view: ViewTransform, parent?: Transform): -1 | 0 | 1 {
  const [a, b] = ringBasis(axis, rotateDeg, parent);
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

// ----- turning several together -----

/** An object to turn with others: its own transform and its group's, as seen from the world. */
export interface TurnTarget extends Transform {
  readonly parent?: Transform;
}

/**
 * Several objects turned together by `degrees` around the world `axis`
 * through `center`, as a rigid whole: each one's new position and rotation
 * in its own group's space (scale doesn't change).
 */
export function turnTogether(
  targets: readonly TurnTarget[],
  center: Vec3,
  axis: Axis,
  degrees: number,
): { translate: Vec3; rotate: Vec3 }[] {
  const turn3 = rotationMatrix({ x: 0, y: 0, z: 0, [axis]: degrees });
  return targets.map((target) => {
    const parent = target.parent ?? IDENTITY;
    const world = compose(parent, target);
    const offset = applyMatrix(turn3, {
      x: world.translate.x - center.x,
      y: world.translate.y - center.y,
      z: world.translate.z - center.z,
    });
    const turned: Transform = {
      translate: { x: center.x + offset.x, y: center.y + offset.y, z: center.z + offset.z },
      rotate: eulerOf(multiply(turn3, rotationMatrix(world.rotate))),
      scale: world.scale,
    };
    const local = relativeTo(parent, turned);
    const r3 = (v: Vec3, places: number) => ({ x: roundTo(v.x, places), y: roundTo(v.y, places), z: roundTo(v.z, places) });
    return { translate: r3(local.translate, 3), rotate: r3(local.rotate, 2) };
  });
}
