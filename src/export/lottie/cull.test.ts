import { describe, expect, it } from 'vitest';
import { addShape, createShape } from '../../model/scene';
import { starterScene } from '../../model/starterScene';
import type { DrawOp, Paint } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { cullFrame, inView } from './cull';
import { lottieAnimation } from './exportScene';
import type { ShapeLayer } from './lottieJson';

/** A horizontal line from (x1, y) to (x2, y). */
const line = (x1: number, x2: number, y: number, paint: Paint): DrawOp => ({
  subpaths: [{ start: { x: x1, y }, segments: [{ kind: 'line', to: { x: x2, y } }], closed: false }],
  paints: [paint],
});
const stroke = (width: number, more: Partial<Extract<Paint, { kind: 'stroke' }>> = {}): Paint => ({
  kind: 'stroke',
  color: '#000000',
  width,
  cap: 'round',
  join: 'round',
  ...more,
});

describe('inView', () => {
  it('keeps a path whose stroke reaches into the picture, though its line is outside', () => {
    // 100 x 100 picture; the line runs 10px above it.
    expect(inView(line(10, 90, -10, stroke(2)), 100, 100)).toBe(false);
    expect(inView(line(10, 90, -10, stroke(20)), 100, 100)).toBe(true); // reaches 10 + 1 soft pixel: in
    expect(inView(line(10, 90, -10, stroke(16)), 100, 100)).toBe(false); // reaches 8 + 1: still out
  });

  it('counts square caps and mitered corners, which reach further than half the width', () => {
    // A line ending 6px left of the picture, 8px wide: a round cap reaches 4 + 1 (out), a square one 5.7 + 1 (in).
    expect(inView(line(-50, -6, 50, stroke(8)), 100, 100)).toBe(false);
    expect(inView(line(-50, -6, 50, stroke(8, { cap: 'square' })), 100, 100)).toBe(true);
    // A mitered corner can reach 4 half-widths: 4px wide reaches 8 + 1 (out), 6px wide 12 + 1 (in).
    expect(inView(line(-50, -10, 50, stroke(4, { join: 'miter' })), 100, 100)).toBe(false);
    expect(inView(line(-50, -10, 50, stroke(6, { join: 'miter' })), 100, 100)).toBe(true);
  });

  it('keeps a curve whose handles reach into the picture, and fills by their outline only', () => {
    const curve: DrawOp = {
      subpaths: [
        {
          start: { x: -40, y: 50 },
          segments: [{ kind: 'bezier', c1: { x: 20, y: 30 }, c2: { x: 20, y: 70 }, to: { x: -40, y: 52 } }],
          closed: true,
        },
      ],
      paints: [{ kind: 'fill', color: '#ff0000' }],
    };
    expect(inView(curve, 100, 100)).toBe(true);
    expect(cullFrame([line(200, 300, 50, { kind: 'fill', color: '#000' }), curve], 100, 100)).toEqual([curve]);
  });
});

describe('the Lottie export leaves out what the camera cannot see', () => {
  it('drops a shape far outside the picture, and keeps one whose thick stroke just reaches in', () => {
    const view: ViewSpec = { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 10, width: 200, height: 200 };
    let scene = starterScene();
    const groupsIn = (s: typeof scene) =>
      (lottieAnimation(s, view, { background: false, name: 't', frames: [0] }).layers[0] as ShapeLayer).shapes.length;
    const before = groupsIn(scene);
    // The picture spans x -10 to 10 (units). A dot at x 30 is out; a dot at x 12 with a 6-unit stroke reaches x 9.
    const far = { ...createShape(scene, 'Ellipse'), id: 'far', translate: { x: 30, y: 0, z: 0 }, props: { diameter: 0, stroke: 1, color: '#000000' } };
    scene = addShape(scene, far);
    expect(groupsIn(scene)).toBe(before);
    const near = { ...createShape(scene, 'Ellipse'), id: 'near', translate: { x: 12, y: 0, z: 0 }, props: { diameter: 0, stroke: 6, color: '#000000' } };
    scene = addShape(scene, near);
    expect(groupsIn(scene)).toBe(before + 1);
  });
});
