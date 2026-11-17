import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { parseSceneFile } from '../model/sceneFile';
import { addShape, createShape, emptyScene, updateShape } from '../model/scene';
import { starterScene } from '../model/starterScene';
import { SHAPE_TYPES, type Scene, type ShapeData, type ShapeType } from '../model/types';
import { arcSegments, createRecorder, recordFrame, type DrawOp, type Point, type Segment } from './drawOps';
import { viewFromCamera, type ViewSpec } from './view';

const FRONT: ViewSpec = {
  rotate: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  pixelsPerUnit: 10,
  width: 200,
  height: 100,
};

const sceneOf = (...shapes: ShapeData[]): Scene => shapes.reduce(addShape, emptyScene());
const shapeOf = (type: ShapeType, patch: Partial<ShapeData> = {}): ShapeData => ({
  ...createShape(emptyScene(), type),
  ...patch,
});

/** A point on a cubic bezier at t. */
function onBezier(from: Point, segment: Extract<Segment, { kind: 'bezier' }>, t: number): Point {
  const u = 1 - t;
  const mix = (a: number, b: number, c: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return {
    x: mix(from.x, segment.c1.x, segment.c2.x, segment.to.x),
    y: mix(from.y, segment.c1.y, segment.c2.y, segment.to.y),
  };
}

describe('arcSegments', () => {
  it('draws a full circle as four quarter curves that stay on the circle', () => {
    const { start, segments } = arcSegments(5, 5, 10, 0, Math.PI * 2, false);
    expect(segments).toHaveLength(4);
    let from = start;
    for (const segment of segments) {
      if (segment.kind !== 'bezier') throw new Error('expected curves');
      for (const t of [0.25, 0.5, 0.75]) {
        const p = onBezier(from, segment, t);
        expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(10, 2); // within 0.03% of the radius
      }
      from = segment.to;
    }
    expect(from.x).toBeCloseTo(start.x);
    expect(from.y).toBeCloseTo(start.y);
  });

  it('follows the canvas rules for direction and wrap-around', () => {
    // Clockwise from 90° to -90°: the long way round, half a turn, through 180°.
    const half = arcSegments(0, 0, 1, Math.PI / 2, -Math.PI / 2, false);
    expect(half.segments).toHaveLength(2);
    expect(half.segments[0].to.x).toBeCloseTo(-1);
    // Anticlockwise from 0 to -90°: a quarter turn, upwards on screen.
    const quarter = arcSegments(0, 0, 1, 0, -Math.PI / 2, true);
    expect(quarter.segments).toHaveLength(1);
    expect(quarter.segments[0].to.y).toBeCloseTo(-1);
    expect(arcSegments(0, 0, 1, 1, 1, false).segments).toHaveLength(0);
  });
});

describe('which zdog item drew each path', () => {
  it('keeps the tag when a path is stroked and then filled (one op, two paints)', () => {
    const { ctx, ops, setSource } = createRecorder();
    setSource('/3');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 10);
    ctx.stroke();
    ctx.fill();
    expect(ops).toHaveLength(1);
    expect(ops[0].paints).toHaveLength(2);
    expect(ops[0].source).toBe('/3');
  });

  it('tags every path of the Nippu examples, each once per frame', () => {
    for (const file of ['nippu', 'nippu-walking']) {
      const opened = parseSceneFile(readFileSync(`src/examples/${file}.zeditor.json`, 'utf8'));
      if (!opened.ok) throw new Error(opened.error);
      const { scene } = opened;
      for (const frame of [0, 37]) {
        const ops = recordFrame(sceneAtFrame(scene, frame), viewFromCamera(objectAtFrame(scene.cameras[0], frame)));
        const sources = ops.map((op) => op.source);
        expect(sources.filter((source) => source === undefined), `${file} frame ${frame}`).toEqual([]);
        expect(new Set(sources).size, `${file} frame ${frame}`).toBe(ops.length);
      }
    }
  });
});

describe('createRecorder', () => {
  it('records a stroked-then-filled path as one op, paints in order', () => {
    const { ctx, ops } = createRecorder();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.lineTo(10, 10);
    ctx.closePath();
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    expect(ops).toEqual([
      {
        subpaths: [
          {
            start: { x: 0, y: 0 },
            segments: [
              { kind: 'line', to: { x: 10, y: 0 } },
              { kind: 'line', to: { x: 10, y: 10 } },
            ],
            closed: true,
          },
        ],
        paints: [
          { kind: 'stroke', color: '#ff0000', width: 3, cap: 'round', join: 'round' },
          { kind: 'fill', color: '#00ff00' },
        ],
      },
    ]);
  });

  it('starts a new subpath after closePath, from the same point', () => {
    const { ctx, ops } = createRecorder();
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(2, 1);
    ctx.closePath();
    ctx.lineTo(1, 5);
    ctx.fill();
    expect(ops[0].subpaths.map((sub) => sub.start)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('refuses canvas features it does not record, instead of dropping them', () => {
    const { ctx } = createRecorder();
    expect(() => ctx.rect(0, 0, 1, 1)).toThrow(/"rect"/);
    expect(() => {
      ctx.globalAlpha = 0.5;
    }).toThrow(/"globalAlpha"/);
  });
});

describe('recordFrame', () => {
  it.each(SHAPE_TYPES)('records every %s without using an unknown canvas feature', (type) => {
    const turned: ViewSpec = { ...FRONT, rotate: { x: -0.4, y: 0.7, z: 0 } };
    const ops = recordFrame(sceneOf(shapeOf(type)), turned);
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      expect(op.subpaths.length).toBeGreaterThan(0);
      expect(op.paints.length).toBeGreaterThan(0);
    }
  });

  it('places shapes in picture pixels: centered, pixels per unit, y down', () => {
    const dot = shapeOf('Shape', { translate: { x: 3, y: -2, z: 0 } }); // stroke 2 = a 2 unit wide dot
    const [op] = recordFrame(sceneOf(dot), FRONT);
    const xs = op.subpaths[0].segments.map((s) => s.to.x);
    const ys = op.subpaths[0].segments.map((s) => s.to.y);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(130);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(30);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20); // 2 units x 10 px
    expect(op.paints).toEqual([{ kind: 'fill', color: '#663366' }]);
  });

  it('scales stroke widths to pixels', () => {
    const rect = shapeOf('Rect'); // stroke 1
    const [op] = recordFrame(sceneOf(rect), FRONT);
    expect(op.paints[0]).toMatchObject({ kind: 'stroke', width: 10, cap: 'round', join: 'round' });
  });

  it('records the butt caps zdog uses for a cylinder side, then round again', () => {
    const cylinder = shapeOf('Cylinder', { rotate: { x: 60, y: 30, z: 0 } });
    const caps = recordFrame(sceneOf(cylinder), FRONT).flatMap((op: DrawOp) =>
      op.paints.flatMap((p) => (p.kind === 'stroke' ? [p.cap] : [])),
    );
    expect(caps).toContain('butt');
  });

  it('records back to front, so what is nearer comes later', () => {
    const near = shapeOf('Ellipse', { translate: { x: 0, y: 0, z: 5 }, props: { ...shapeOf('Ellipse').props, color: '#ff0000' } });
    const far = shapeOf('Ellipse', { id: 'ellipse-2', translate: { x: 0, y: 0, z: -5 }, props: { ...shapeOf('Ellipse').props, color: '#0000ff' } });
    const colors = recordFrame(sceneOf(near, far), FRONT).map((op) => op.paints[0].color);
    expect(colors).toEqual(['#0000ff', '#ff0000']);
  });

  it('turns the world with the view, and centers the target', () => {
    const dot = shapeOf('Shape', { translate: { x: 0, y: 0, z: 2 } });
    const sideways: ViewSpec = { ...FRONT, rotate: { x: 0, y: Math.PI / 2, z: 0 } };
    const [op] = recordFrame(sceneOf(dot), sideways);
    const xs = op.subpaths[0].segments.map((s) => s.to.x);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(100 - 20);

    const centered = recordFrame(sceneOf(dot), { ...FRONT, target: { x: 0, y: 0, z: 2 } })[0];
    const cx = centered.subpaths[0].segments.map((s) => s.to.x);
    expect((Math.max(...cx) + Math.min(...cx)) / 2).toBeCloseTo(100);
  });

  it('records the whole starter scene, with faded colors for opacity', () => {
    const scene = updateShape(starterScene(), 'box-1', { opacity: 0.5 });
    const ops = recordFrame(scene, FRONT);
    expect(ops.length).toBeGreaterThan(9);
    expect(ops.some((op) => op.paints.some((p) => p.color === '#ee662280'))).toBe(true);
  });
});
