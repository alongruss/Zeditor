import * as Zdog from 'zdog';
import { describe, expect, it } from 'vitest';
import { createShape, emptyScene } from '../model/scene';
import { starterScene } from '../model/starterScene';
import { SHAPE_TYPES } from '../model/types';
import { createZdogShape, zdogOptions } from './toZdog';

describe('zdogOptions', () => {
  it('converts rotation from degrees to radians', () => {
    const shape = { ...createShape(emptyScene(), 'Box'), rotate: { x: 90, y: 180, z: -45 } };
    const { rotate } = zdogOptions(shape) as { rotate: { x: number; y: number; z: number } };
    expect(rotate.x).toBeCloseTo(Math.PI / 2);
    expect(rotate.y).toBeCloseTo(Math.PI);
    expect(rotate.z).toBeCloseTo(-Math.PI / 4);
  });

  it('copies props, so zdog never holds the scene data', () => {
    const shape = starterScene().shapes.find((s) => s.type === 'Shape')!;
    const options = zdogOptions(shape);
    expect(options.path).toEqual(shape.props.path);
    expect(options.path).not.toBe(shape.props.path);
  });
});

describe('createZdogShape', () => {
  it.each(SHAPE_TYPES)('builds a zdog %s', (type) => {
    const object = createZdogShape(createShape(emptyScene(), type));
    expect(object).toBeInstanceOf(Zdog[type]);
  });

  it('passes position, scale and type settings through', () => {
    const box = starterScene().shapes.find((s) => s.id === 'box-1')!;
    const object = createZdogShape(box) as Zdog.Box;
    expect(object.translate).toMatchObject({ x: 4, y: 4, z: -4 });
    expect(object.width).toBe(5);
    expect(object.topFace).toBe('#eeaa00');
    expect(object.frontFace).toBe(true);
  });
});
