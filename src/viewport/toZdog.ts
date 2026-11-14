import * as Zdog from 'zdog';
import type { ShapeData, ShapeType } from '../model/types';

const DEG_TO_RAD = Math.PI / 180;

type ZdogConstructor = new (options: Record<string, unknown>) => Zdog.Anchor;

const CONSTRUCTORS: Record<ShapeType, ZdogConstructor> = {
  Rect: Zdog.Rect as unknown as ZdogConstructor,
  RoundedRect: Zdog.RoundedRect as unknown as ZdogConstructor,
  Ellipse: Zdog.Ellipse as unknown as ZdogConstructor,
  Polygon: Zdog.Polygon as unknown as ZdogConstructor,
  Shape: Zdog.Shape as unknown as ZdogConstructor,
  Hemisphere: Zdog.Hemisphere as unknown as ZdogConstructor,
  Cylinder: Zdog.Cylinder as unknown as ZdogConstructor,
  Cone: Zdog.Cone as unknown as ZdogConstructor,
  Box: Zdog.Box as unknown as ZdogConstructor,
};

/** zdog constructor options for a shape (rotation converted from degrees to radians). */
export function zdogOptions(shape: ShapeData): Record<string, unknown> {
  const { translate, rotate } = shape;
  return {
    // Copy, so zdog never holds a reference into the (immutable) scene data.
    ...structuredClone(shape.props),
    translate: { x: translate.x, y: translate.y, z: translate.z },
    rotate: { x: rotate.x * DEG_TO_RAD, y: rotate.y * DEG_TO_RAD, z: rotate.z * DEG_TO_RAD },
    scale: shape.scale,
  };
}

export function createZdogShape(shape: ShapeData): Zdog.Anchor {
  return new CONSTRUCTORS[shape.type](zdogOptions(shape));
}
