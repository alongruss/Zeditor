import type { Vec3 } from './types';

/**
 * Transforms as zdog applies them, for placing objects inside groups. A
 * point p in an object's own space lands at  R(s · p) + t  in its parent's
 * space, where R turns by the object's rotation the way zdog's
 * Vector.rotate does: around z, then y, then x. Pure functions; rotations
 * in degrees, as the scene stores them.
 */

export interface Transform {
  readonly translate: Vec3;
  /** Degrees. */
  readonly rotate: Vec3;
  readonly scale: number;
}

/** A 3×3 matrix, rows of columns: m[row][column]. */
export type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

export const IDENTITY: Transform = { translate: { x: 0, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: 1 };

const DEG = Math.PI / 180;

/** zdog's rotation as a matrix: M = Rx · Ry · Rz (z is applied first). */
export function rotationMatrix(rotateDeg: Vec3): Matrix {
  const [ca, sa] = [Math.cos(rotateDeg.x * DEG), Math.sin(rotateDeg.x * DEG)];
  const [cb, sb] = [Math.cos(rotateDeg.y * DEG), Math.sin(rotateDeg.y * DEG)];
  const [cg, sg] = [Math.cos(rotateDeg.z * DEG), Math.sin(rotateDeg.z * DEG)];
  return [
    [cb * cg, -cb * sg, -sb],
    [ca * sg - sa * sb * cg, ca * cg + sa * sb * sg, -sa * cb],
    [sa * sg + ca * sb * cg, sa * cg - ca * sb * sg, ca * cb],
  ];
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const cell = (r: number, c: number) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
  return [
    [cell(0, 0), cell(0, 1), cell(0, 2)],
    [cell(1, 0), cell(1, 1), cell(1, 2)],
    [cell(2, 0), cell(2, 1), cell(2, 2)],
  ];
}

export function transpose(m: Matrix): Matrix {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export function applyMatrix(m: Matrix, v: Vec3): Vec3 {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

/** Rounds away float noise (1e-12 and the like), so values read cleanly in the Inspector. */
const clean = (n: number, places = 6) => {
  const rounded = Math.round(n * 10 ** places) / 10 ** places;
  // Huge numbers can't be scaled up to round: they have no float noise to lose anyway.
  if (!Number.isFinite(rounded)) return n;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** The zdog rotation (degrees) whose matrix is `m`. Inverse of rotationMatrix. */
export function eulerOf(m: Matrix): Vec3 {
  const sb = Math.max(-1, Math.min(1, -m[0][2]));
  const b = Math.asin(sb);
  let a: number;
  let g: number;
  if (Math.abs(Math.cos(b)) > 1e-9) {
    g = Math.atan2(-m[0][1], m[0][0]);
    a = Math.atan2(-m[1][2], m[2][2]);
  } else {
    // Turned a quarter around y: x and z turn the same way. Put it all in x.
    g = 0;
    a = Math.atan2(-m[1][0] * sb, m[1][1]);
  }
  return { x: clean(a / DEG), y: clean(b / DEG), z: clean(g / DEG) };
}

/** Where `transform` puts point p:  R(s · p) + t. */
export function applyTransform(transform: Transform, p: Vec3): Vec3 {
  const turned = applyMatrix(rotationMatrix(transform.rotate), {
    x: p.x * transform.scale,
    y: p.y * transform.scale,
    z: p.z * transform.scale,
  });
  return { x: turned.x + transform.translate.x, y: turned.y + transform.translate.y, z: turned.z + transform.translate.z };
}

/** `outer` after `inner`: applying the result is applying inner, then outer. */
export function compose(outer: Transform, inner: Transform): Transform {
  const r = multiply(rotationMatrix(outer.rotate), rotationMatrix(inner.rotate));
  const t = applyTransform(outer, inner.translate);
  return {
    translate: { x: clean(t.x), y: clean(t.y), z: clean(t.z) },
    rotate: eulerOf(r),
    scale: clean(outer.scale * inner.scale),
  };
}

/**
 * The transform that, inside `parent`, gives `world`: the local transform
 * an object needs to keep its place when it's put into that parent.
 */
export function relativeTo(parent: Transform, world: Transform): Transform {
  const inverseR = transpose(rotationMatrix(parent.rotate));
  const offset = {
    x: world.translate.x - parent.translate.x,
    y: world.translate.y - parent.translate.y,
    z: world.translate.z - parent.translate.z,
  };
  const t = applyMatrix(inverseR, offset);
  const s = parent.scale === 0 ? 1 : parent.scale;
  return {
    translate: { x: clean(t.x / s), y: clean(t.y / s), z: clean(t.z / s) },
    rotate: eulerOf(multiply(inverseR, rotationMatrix(world.rotate))),
    scale: clean(world.scale / s),
  };
}

/** A direction (a change of position) in the parent's space, from one in the world. */
export function directionInto(parent: Transform, worldDelta: Vec3): Vec3 {
  const d = applyMatrix(transpose(rotationMatrix(parent.rotate)), worldDelta);
  const s = parent.scale === 0 ? 1 : parent.scale;
  const into = { x: d.x / s, y: d.y / s, z: d.z / s };
  // A group scaled almost to nothing: no sensible change inside it.
  return Number.isFinite(into.x) && Number.isFinite(into.y) && Number.isFinite(into.z) ? into : { x: 0, y: 0, z: 0 };
}
