import { describe, expect, it } from 'vitest';
import { MAX_FRAME, MAX_POSITION, MAX_SIDES } from './limits';
import { repairScene } from './repair';
import { addShape, createShape, findShape, updateShape } from './scene';
import { starterScene } from './starterScene';
import type { Easing, Scene, ShapeData } from './types';

const withShape = (scene: Scene, id: string, change: (shape: ShapeData) => ShapeData): Scene => ({
  ...scene,
  shapes: scene.shapes.map((shape) => (shape.id === id ? change(shape) : shape)),
});

describe('repairScene', () => {
  it('gives back the very same scene when nothing needs fixing', () => {
    const scene = starterScene();
    expect(repairScene(scene)).toBe(scene);
    const moved = updateShape(scene, 'box-1', { translate: { x: 3 } });
    expect(repairScene(moved, scene)).toBe(moved);
  });

  it('only looks at objects that changed, and keeps the rest as they are', () => {
    const scene = starterScene();
    const next = withShape(scene, 'box-1', (shape) => ({ ...shape, translate: { ...shape.translate, x: 1e9 } }));
    const fixed = repairScene(next, scene);
    expect(findShape(fixed, 'box-1')!.translate.x).toBe(MAX_POSITION);
    for (const shape of fixed.shapes) if (shape.id !== 'box-1') expect(shape).toBe(findShape(scene, shape.id));
  });

  it('clamps numbers to their limits and rounds whole-number ones', () => {
    let scene = starterScene();
    const polygon = createShape(scene, 'Polygon');
    scene = addShape(scene, polygon);
    const huge = withShape(scene, polygon.id, (shape) => ({ ...shape, props: { ...shape.props, sides: 5000 }, scale: 1e6, opacity: 3 }));
    const fixed = findShape(repairScene(huge, scene), polygon.id)!;
    expect(fixed.props.sides).toBe(MAX_SIDES);
    expect(fixed.scale).toBe(1000);
    expect(fixed.opacity).toBe(1);
    const half = withShape(scene, polygon.id, (shape) => ({ ...shape, props: { ...shape.props, sides: 6.6 } }));
    expect(findShape(repairScene(half, scene), polygon.id)!.props.sides).toBe(7);
  });

  it('puts back the value from before the edit when a number is NaN or Infinity, or else the default', () => {
    const scene = updateShape(starterScene(), 'box-1', { translate: { y: 2 }, props: { stroke: 3 } });
    const broken = withShape(scene, 'box-1', (shape) => ({
      ...shape,
      translate: { ...shape.translate, y: NaN },
      props: { ...shape.props, stroke: Infinity },
    }));
    const fixed = findShape(repairScene(broken, scene), 'box-1')!;
    expect(fixed.translate.y).toBe(2);
    expect(fixed.props.stroke).toBe(3);
    // With nothing before it (a scene file, say): the default.
    const fresh = findShape(repairScene(broken), 'box-1')!;
    expect(fresh.translate.y).toBe(0);
    expect(fresh.props.stroke).toBe(0);
  });

  it('keeps keys on whole frames within the limits, with a known easing, and drops keys that are not numbers', () => {
    const scene = starterScene();
    const keyed = withShape(scene, 'box-1', (shape) => ({
      ...shape,
      tracks: {
        'translate.x': [
          { frame: 0, value: 1, easing: 'linear' },
          { frame: 10.4, value: NaN, easing: 'linear' },
          { frame: 2e6, value: 2, easing: 'wobbly' as unknown as Easing },
          { frame: 3e6, value: 3, easing: [0.2, 0, 0.8, 1] },
        ],
        'rotate.y': [{ frame: 5, value: Infinity, easing: 'linear' }],
      },
    }));
    const fixed = findShape(repairScene(keyed, scene), 'box-1')!;
    // The two keys past the end land on the last frame: the later one stays.
    expect(fixed.tracks).toEqual({
      'translate.x': [
        { frame: 0, value: 1, easing: 'linear' },
        { frame: MAX_FRAME, value: 3, easing: [0.2, 0, 0.8, 1] },
      ],
    });
  });

  it('keeps the frame rate and length within limits, and cleans names', () => {
    const scene = starterScene();
    const odd: Scene = {
      ...withShape(scene, 'box-1', (shape) => ({ ...shape, name: '  ‮box\n' })),
      settings: { ...scene.settings, fps: 1000, duration: 5e6 },
    };
    const fixed = repairScene(odd, scene);
    expect(fixed.settings).toMatchObject({ fps: 120, duration: MAX_FRAME });
    expect(findShape(fixed, 'box-1')!.name).toBe('box');
    const unnamed = withShape(scene, 'box-1', (shape) => ({ ...shape, name: '\t' }));
    expect(findShape(repairScene(unnamed, scene), 'box-1')!.name).toBe(findShape(scene, 'box-1')!.name);
  });
});
