import { describe, expect, it } from 'vitest';
import { Zdog } from '../zdog';
import { applyTransform, compose, directionInto, eulerOf, relativeTo, rotationMatrix, type Transform } from './transform';
import type { Vec3 } from './types';

const DEG = Math.PI / 180;

/** What zdog itself does to point p for a transform: multiply, rotate, add. */
function zdogApply(t: Transform, p: Vec3): Vec3 {
  const v = new Zdog.Vector(p);
  v.multiply(t.scale);
  v.rotate({ x: t.rotate.x * DEG, y: t.rotate.y * DEG, z: t.rotate.z * DEG });
  v.add(t.translate);
  return { x: v.x, y: v.y, z: v.z };
}

const expectClose = (a: Vec3, b: Vec3, places = 6) => {
  expect(a.x).toBeCloseTo(b.x, places);
  expect(a.y).toBeCloseTo(b.y, places);
  expect(a.z).toBeCloseTo(b.z, places);
};

const POINTS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 2, y: -3, z: 5 },
];

const SAMPLES: Transform[] = [
  { translate: { x: 0, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: 1 },
  { translate: { x: 3, y: -2, z: 1 }, rotate: { x: 30, y: -45, z: 12.5 }, scale: 1.5 },
  { translate: { x: -1, y: 4, z: 0 }, rotate: { x: -90, y: 22.5, z: 170 }, scale: 0.5 },
  { translate: { x: 0, y: 0, z: 7 }, rotate: { x: 10, y: 90, z: 0 }, scale: 2 },
];

describe('rotationMatrix', () => {
  it('turns points exactly as zdog does (z, then y, then x)', () => {
    for (const t of SAMPLES) {
      for (const p of POINTS) expectClose(applyTransform(t, p), zdogApply(t, p));
    }
  });
});

describe('eulerOf', () => {
  it('gives back a rotation that turns everything the same way', () => {
    for (const { rotate } of SAMPLES) {
      const again = eulerOf(rotationMatrix(rotate));
      for (const p of POINTS) {
        const a = applyTransform({ translate: { x: 0, y: 0, z: 0 }, rotate, scale: 1 }, p);
        const b = applyTransform({ translate: { x: 0, y: 0, z: 0 }, rotate: again, scale: 1 }, p);
        expectClose(a, b);
      }
    }
  });
});

describe('compose and relativeTo', () => {
  it('compose(outer, inner) is inner then outer, as nested zdog anchors', () => {
    for (const outer of SAMPLES) {
      for (const inner of SAMPLES) {
        const both = compose(outer, inner);
        for (const p of POINTS) expectClose(applyTransform(both, p), zdogApply(outer, zdogApply(inner, p)), 5);
      }
    }
  });

  it('relativeTo finds the local transform that keeps the world one', () => {
    for (const parent of SAMPLES) {
      for (const world of SAMPLES) {
        const local = relativeTo(parent, world);
        const back = compose(parent, local);
        for (const p of POINTS) expectClose(applyTransform(back, p), applyTransform(world, p), 4);
      }
    }
  });

  it('directionInto turns a world change into the parent space', () => {
    const parent = SAMPLES[1];
    const local = directionInto(parent, { x: 1, y: 0, z: 0 });
    // Moving by `local` inside the parent moves by +1 world X.
    const a = applyTransform(parent, { x: 0, y: 0, z: 0 });
    const b = applyTransform(parent, local);
    expectClose({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, { x: 1, y: 0, z: 0 });
  });
});
