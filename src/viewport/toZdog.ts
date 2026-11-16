import type * as ZdogTypes from 'zdog';
import { Zdog } from '../zdog';
import { fadeColor } from '../model/color';
import { getShapeTypeDef } from '../model/shapeTypes';
import type { Props, ShapeData, ShapeType } from '../model/types';

const DEG_TO_RAD = Math.PI / 180;

type ZdogConstructor = new (options: Record<string, unknown>) => ZdogTypes.Anchor;

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

/**
 * The shape's props with its opacity multiplied into every color it has
 * (main, back and face colors), since zdog itself has no opacity setting.
 */
export function fadedProps(shape: ShapeData): Props {
  if (shape.opacity >= 1) return shape.props;
  const faded: Record<string, Props[string]> = { ...shape.props };
  const { fields, defaults } = getShapeTypeDef(shape.type);
  for (const field of fields) {
    if (field.kind !== 'color' && field.kind !== 'face') continue;
    const value = shape.props[field.key] ?? defaults[field.key];
    // A face set to `true` uses the main color, which is faded already.
    if (typeof value === 'string') faded[field.key] = fadeColor(value, shape.opacity);
  }
  return faded;
}

/** A shape's position, rotation (in radians) and scale, as zdog takes them. */
export function zdogTransform(shape: Pick<ShapeData, 'translate' | 'rotate' | 'scale'>): {
  translate: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: number;
} {
  const { translate, rotate } = shape;
  return {
    translate: { x: translate.x, y: translate.y, z: translate.z },
    rotate: { x: rotate.x * DEG_TO_RAD, y: rotate.y * DEG_TO_RAD, z: rotate.z * DEG_TO_RAD },
    scale: shape.scale,
  };
}

/** zdog constructor options for a shape (rotation converted from degrees to radians). */
export function zdogOptions(shape: ShapeData): Record<string, unknown> {
  return {
    // Copy, so zdog never holds a reference into the (immutable) scene data.
    ...structuredClone(fadedProps(shape)),
    ...zdogTransform(shape),
  };
}

export function createZdogShape(shape: ShapeData): ZdogTypes.Anchor {
  return new CONSTRUCTORS[shape.type](zdogOptions(shape));
}
