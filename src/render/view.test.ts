import { describe, expect, it } from 'vitest';
import { addShape, createCamera, createShape, emptyScene } from '../model/scene';
import type { CameraData, Vec3 } from '../model/types';
import { cameraCorners } from '../viewport/CameraFrames';
import { project } from '../viewport/gizmoMath';
import { recordFrame, type DrawOp } from './drawOps';
import {
  LOOK_THROUGH_MARGIN,
  cameraFrame,
  lookThroughView,
  rootTranslate,
  turn,
  unturn,
  viewFromCamera,
  type ViewSpec,
} from './view';

const DEG = Math.PI / 180;

/** A camera that rolls, looks at a point off the origin, and is wider than tall. */
function rolledCamera(patch: Partial<CameraData> = {}): CameraData {
  return {
    ...createCamera(emptyScene(), {
      rotate: { x: -25, y: 40, z: 20 },
      target: { x: 4, y: -3, z: 2 },
      viewSpan: 20,
      width: 640,
      height: 360,
    }),
    ...patch,
  };
}

const expectClose = (actual: Vec3 | { x: number; y: number }, expected: typeof actual, places = 6) => {
  for (const axis of Object.keys(expected) as (keyof typeof expected)[]) {
    expect(actual[axis], String(axis)).toBeCloseTo(expected[axis], places);
  }
};

/** The middle of everything a frame draws (the box around every path point). */
function middleOf(ops: readonly DrawOp[]): { x: number; y: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const op of ops) {
    for (const subpath of op.subpaths) {
      for (const p of [subpath.start, ...subpath.segments.map((s) => s.to)]) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

describe('viewFromCamera', () => {
  it('turns degrees into radians and fits the view span across the shorter side', () => {
    const view = viewFromCamera(rolledCamera());
    expectClose(view.rotate, { x: -25 * DEG, y: 40 * DEG, z: 20 * DEG });
    expect(view.target).toEqual({ x: 4, y: -3, z: 2 });
    expect(view.pixelsPerUnit).toBeCloseTo(360 / 20);
    expect([view.width, view.height]).toEqual([640, 360]);
    expect(viewFromCamera(rolledCamera({ width: 300, height: 900 })).pixelsPerUnit).toBeCloseTo(300 / 20);
  });
});

describe('turn, unturn and rootTranslate', () => {
  const rotate = { x: 0.3, y: -1.1, z: 0.7 };

  it('unturn undoes turn', () => {
    const v = { x: 1.5, y: -2, z: 3 };
    expectClose(unturn(turn(v, rotate), rotate), v);
    expectClose(turn(unturn(v, rotate), rotate), v);
  });

  it('moves the target to the middle of the picture', () => {
    const target = { x: 4, y: -3, z: 2 };
    const moved = turn(target, rotate);
    const t = rootTranslate({ rotate, target });
    expectClose({ x: moved.x + t.x, y: moved.y + t.y, z: moved.z + t.z }, { x: 0, y: 0, z: 0 });
  });

  it('draws a shape sitting on the target in the middle of the picture, rolled or not', () => {
    for (const camera of [rolledCamera(), rolledCamera({ rotate: { x: 0, y: 0, z: 0 } })]) {
      const circle = { ...createShape(emptyScene(), 'Ellipse'), translate: camera.target };
      const ops = recordFrame(addShape(emptyScene(), circle), viewFromCamera(camera));
      expectClose(middleOf(ops), { x: camera.width / 2, y: camera.height / 2 }, 3);
    }
  });
});

describe('cameraFrame', () => {
  it('fits the picture in the area with a margin, centered, keeping its shape', () => {
    const frame = cameraFrame(rolledCamera({ width: 1920, height: 1080 }), 816, 632);
    expect(frame.width).toBeCloseTo(816 - 2 * LOOK_THROUGH_MARGIN);
    expect(frame.width / frame.height).toBeCloseTo(1920 / 1080);
    expect(frame.left).toBeCloseTo(LOOK_THROUGH_MARGIN);
    expect(frame.top).toBeCloseTo((632 - frame.height) / 2);

    const tall = cameraFrame(rolledCamera({ width: 300, height: 900 }), 816, 632);
    expect(tall.height).toBeCloseTo(632 - 2 * LOOK_THROUGH_MARGIN);
    expect(tall.left).toBeCloseTo((816 - tall.width) / 2);
  });

  it('never has no size, even in a tiny area', () => {
    const frame = cameraFrame(rolledCamera(), 4, 4);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
  });
});

describe('lookThroughView', () => {
  it('shows the camera picture scaled into its frame, over the whole area', () => {
    const camera = rolledCamera();
    const own = viewFromCamera(camera);
    const view = lookThroughView(camera, 1000, 700);
    const frame = cameraFrame(camera, 1000, 700);
    expect([view.width, view.height]).toEqual([1000, 700]);
    expect(view.pixelsPerUnit).toBeCloseTo(own.pixelsPerUnit * (frame.width / camera.width));
    expect(view.rotate).toEqual(own.rotate);
    expect(view.target).toEqual(own.target);
  });

  it('puts a point where the exported picture has it, scaled into the frame', () => {
    const camera = rolledCamera();
    const exported = viewFromCamera(camera);
    const shown = lookThroughView(camera, 1000, 700);
    const frame = cameraFrame(camera, 1000, 700);
    const asTransform = (v: ViewSpec) => ({ width: v.width, height: v.height, zoom: v.pixelsPerUnit, rotate: v.rotate, target: v.target });
    const p = { x: 6, y: 1, z: -4 };
    const inPicture = project(p, asTransform(exported));
    const onScreen = project(p, asTransform(shown));
    const scale = frame.width / camera.width;
    expectClose(onScreen, { x: frame.left + inPicture.x * scale, y: frame.top + inPicture.y * scale });
  });
});

describe('cameraCorners', () => {
  it("are the corners of the camera's picture: they land on its frame when looking through it", () => {
    for (const camera of [rolledCamera(), rolledCamera({ width: 300, height: 900 })]) {
      const shown = lookThroughView(camera, 1000, 700);
      const frame = cameraFrame(camera, 1000, 700);
      const view = { width: 1000, height: 700, zoom: shown.pixelsPerUnit, rotate: shown.rotate, target: shown.target };
      const [topLeft, topRight, bottomRight, bottomLeft] = cameraCorners(camera).map((corner) => project(corner, view));
      const right = frame.left + frame.width;
      const bottom = frame.top + frame.height;
      expectClose(topLeft, { x: frame.left, y: frame.top }, 4);
      expectClose(topRight, { x: right, y: frame.top }, 4);
      expectClose(bottomRight, { x: right, y: bottom }, 4);
      expectClose(bottomLeft, { x: frame.left, y: bottom }, 4);
    }
  });
});
