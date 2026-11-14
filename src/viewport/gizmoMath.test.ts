import * as Zdog from 'zdog';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../model/types';
import {
  AXES,
  ARROW_LENGTH_PX,
  angleBetween,
  arrowEnabled,
  arrowPoints,
  moveAlongAxis,
  project,
  ringDirection,
  ringPoints,
  ringRotation,
  screenAngle,
  type ViewTransform,
} from './gizmoMath';

const DEG = Math.PI / 180;
const front: ViewTransform = { width: 200, height: 100, zoom: 10, rotate: { x: 0, y: 0 } };
const angled = (x: number, y: number): ViewTransform => ({ ...front, rotate: { x: x * DEG, y: y * DEG } });
const origin: Vec3 = { x: 0, y: 0, z: 0 };
/** One pixel per unit, centered on 0,0: screen x/y are the turned world x/y. */
const FLAT: ViewTransform = { width: 0, height: 0, zoom: 1, rotate: { x: 0, y: 0 } };

/** Cameras from many angles, including ones looking straight down an axis. */
const CAMERAS: ViewTransform[] = [
  front,
  angled(0, 90),
  angled(90, 0),
  angled(-20, 30),
  angled(35, -120),
  angled(-60, 200),
  angled(10, 45),
];

/** Shape rotations in degrees, as the Inspector shows them. */
const ROTATIONS: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 30, y: 0, z: 0 },
  { x: 0, y: 50, z: 0 },
  { x: 25, y: -40, z: 70 },
  { x: -80, y: 120, z: -30 },
];

describe('project', () => {
  it('places world points like zdog: centered, zoom pixels per unit, y down', () => {
    expect(project({ x: 1, y: 2, z: 3 }, front)).toEqual({ x: 110, y: 70 });
    // Turning the camera a quarter turn round Y brings +Z to the screen's left/right.
    const turned = project({ x: 0, y: 0, z: 1 }, angled(0, 90));
    expect(turned.x).toBeCloseTo(90);
    expect(turned.y).toBeCloseTo(50);
  });
});

describe('moveAlongAxis', () => {
  it('turns a drag along the arrow into world units', () => {
    expect(moveAlongAxis(origin, 'x', { x: 40, y: 0 }, front, false)).toEqual({ x: 4, y: 0, z: 0 });
    expect(moveAlongAxis(origin, 'y', { x: 0, y: 25 }, front, false)).toEqual({ x: 0, y: 2.5, z: 0 });
    // Movement across the arrow is ignored.
    expect(moveAlongAxis(origin, 'x', { x: 0, y: 40 }, front, false)).toEqual(origin);
  });

  it('keeps the grabbed point under the pointer from any camera angle', () => {
    const start = { x: 1, y: -2, z: 3 };
    for (const view of CAMERAS) {
      for (const axis of AXES) {
        if (!arrowEnabled(axis, view)) continue;
        // Where a point 2.5 units along the axis appears, relative to the start.
        const moved = { ...start, [axis]: start[axis] + 2.5 };
        const a = project(start, view);
        const b = project(moved, view);
        const result = moveAlongAxis(start, axis, { x: b.x - a.x, y: b.y - a.y }, view, false);
        expect(result[axis]).toBeCloseTo(start[axis] + 2.5, 2);
      }
    }
  });

  // 2020 bug: the direction came from the sign of dx + dy, so it was NaN when dx = -dy,
  // and the distance was raw pixels.
  it('never gives NaN, even for dx = -dy or an axis pointing at the camera', () => {
    for (const view of CAMERAS) {
      for (const axis of AXES) {
        const result = moveAlongAxis(origin, axis, { x: 30, y: -30 }, view, false);
        expect(Number.isFinite(result.x) && Number.isFinite(result.y) && Number.isFinite(result.z)).toBe(true);
      }
    }
    // Looking straight down X: the X arrow is off and does nothing.
    expect(arrowEnabled('x', angled(0, 90))).toBe(false);
    expect(moveAlongAxis(origin, 'x', { x: 50, y: 0 }, angled(0, 90), false)).toBe(origin);
    expect(arrowEnabled('z', front)).toBe(false);
  });

  it('snaps to whole units with Shift', () => {
    expect(moveAlongAxis({ x: 0.3, y: 0, z: 0 }, 'x', { x: 23, y: 0 }, front, true).x).toBe(3);
  });

  it('draws arrows a fixed length on screen whatever the zoom', () => {
    for (const zoom of [5, 40]) {
      const [from, to] = arrowPoints(origin, 'x', { ...front, zoom });
      expect(to.x - from.x).toBeCloseTo(ARROW_LENGTH_PX);
    }
  });
});

/** Rotates a vector like a zdog shape with this rotation (degrees). */
function shapeTurn(v: Vec3, rotateDeg: Vec3): Vec3 {
  const out = new Zdog.Vector(v);
  out.rotate({ x: rotateDeg.x * DEG, y: rotateDeg.y * DEG, z: rotateDeg.z * DEG });
  return { x: out.x, y: out.y, z: out.z };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/** Undoes `shapeTurn`. */
function shapeUnturn(v: Vec3, rotateDeg: Vec3): Vec3 {
  const out = new Zdog.Vector(v);
  // One axis at a time, in the reverse order.
  out.rotate({ x: -rotateDeg.x * DEG, y: 0, z: 0 });
  out.rotate({ x: 0, y: -rotateDeg.y * DEG, z: 0 });
  out.rotate({ x: 0, y: 0, z: -rotateDeg.z * DEG });
  return { x: out.x, y: out.y, z: out.z };
}

describe('rotation rings', () => {
  it('turn the shape around the ring they show, the way the pointer sweeps', () => {
    for (const view of CAMERAS) {
      for (const rotation of ROTATIONS) {
        for (const axis of AXES) {
          const direction = ringDirection(axis, rotation, view);
          if (direction === 0) continue;

          // Turning the shape a little on this axis, as zdog does it, moves every
          // point around one world axis. Find that axis from two points' motion.
          const turned = { ...rotation, [axis]: rotation[axis] + 1 };
          const motion = (world: Vec3) => sub(shapeTurn(shapeUnturn(world, rotation), turned), world);
          const realAxis = cross(motion({ x: 1, y: 0.2, z: 0.1 }), motion({ x: -0.3, y: 1, z: 0.4 }));

          // The ring drawn for this axis must lie across that axis. Seen from the
          // front, screen x/y are world x/y; seen from the side, screen x is -z.
          const fromFront = ringPoints(origin, axis, rotation, FLAT);
          const fromSide = ringPoints(origin, axis, rotation, { ...FLAT, rotate: { x: 0, y: Math.PI / 2 } });
          for (let i = 0; i < fromFront.length; i += 7) {
            const world = { x: fromFront[i].x, y: fromFront[i].y, z: -fromSide[i].x };
            expect(dot(normalize(world), normalize(realAxis))).toBeCloseTo(0, 6);
          }

          // A point on it, turned, must move round the screen the way ringDirection says.
          const onRing = normalize(cross(realAxis, { x: 0.3, y: -0.5, z: 0.8 }));
          const center = project(origin, view);
          const before = project(onRing, view);
          const after = project(add(onRing, motion(onRing)), view);
          const swept = angleBetween(screenAngle(center, before), screenAngle(center, after));
          expect(Math.sign(swept), `${axis} ring, rotation ${JSON.stringify(rotation)}`).toBe(direction);
        }
      }
    }
  });

  it('switch off when seen edge-on', () => {
    // From the front, the X and Y rings are edge-on lines; the Z ring faces you.
    expect(ringDirection('x', ROTATIONS[0], front)).toBe(0);
    expect(ringDirection('y', ROTATIONS[0], front)).toBe(0);
    expect(ringDirection('z', ROTATIONS[0], front)).not.toBe(0);
  });

  it('add the swept angle, snapping to 15° with Shift', () => {
    expect(ringRotation(10, Math.PI / 2, 1, false)).toBe(100);
    expect(ringRotation(10, Math.PI / 2, -1, false)).toBe(-80);
    expect(ringRotation(10, 0.2, 1, true)).toBe(15);
  });

  it('measure sweeps across the ±180° seam', () => {
    expect(angleBetween(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleBetween(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });
});
