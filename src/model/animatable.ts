import { getShapeTypeDef } from './shapeTypes';
import type { PropertyPath, PropValue, ShapeData, ShapeType, TrackValue, Vec3 } from './types';

/**
 * The one list of what can be animated, used by the evaluator, the editor,
 * the file checks, the Inspector and the exports. Every Inspector value is
 * animatable: position, rotation, scale and opacity on every shape, plus the
 * shape type's own fields.
 */

/**
 * How a property moves between keys:
 * - number: smoothly (whole numbers stay whole)
 * - color: smoothly, through RGBA
 * - face: a Box face; smoothly between two colors, otherwise it holds
 * - hold: jumps at the next key (e.g. Fill on/off)
 */
export type PropertyKind = 'number' | 'color' | 'face' | 'hold';

export interface PropertySpec {
  readonly path: PropertyPath;
  readonly label: string;
  readonly kind: PropertyKind;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

const TRANSFORM: readonly PropertySpec[] = [
  ...AXES.map((axis): PropertySpec => ({ path: `translate.${axis}`, label: `Position ${axis.toUpperCase()}`, kind: 'number' })),
  ...AXES.map((axis): PropertySpec => ({ path: `rotate.${axis}`, label: `Rotation ${axis.toUpperCase()}`, kind: 'number' })),
  { path: 'scale', label: 'Scale', kind: 'number', min: 0 },
  { path: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1 },
];

const byType = new Map<ShapeType, readonly PropertySpec[]>();

/** Every animatable property of a shape type, in Inspector order. */
export function propertiesOf(type: ShapeType): readonly PropertySpec[] {
  let list = byType.get(type);
  if (!list) {
    const fields = getShapeTypeDef(type).fields.map((field): PropertySpec => {
      const path = `props.${field.key}`;
      switch (field.kind) {
        case 'number':
          return { path, label: field.label, kind: 'number', min: field.min, integer: field.integer };
        case 'color':
          return { path, label: field.label, kind: 'color' };
        case 'face':
          return { path, label: `${field.label} face`, kind: 'face' };
        case 'boolean':
          return { path, label: field.label, kind: 'hold' };
      }
    });
    list = [...TRANSFORM, ...fields];
    byType.set(type, list);
  }
  return list;
}

export function propertySpec(type: ShapeType, path: PropertyPath): PropertySpec | undefined {
  return propertiesOf(type).find((spec) => spec.path === path);
}

const vectorOf = (path: PropertyPath): ['translate' | 'rotate', Axis] | null => {
  const match = /^(translate|rotate)\.([xyz])$/.exec(path);
  return match ? [match[1] as 'translate' | 'rotate', match[2] as Axis] : null;
};

/** A property's own (un-animated) value. */
export function readBase(shape: ShapeData, path: PropertyPath): TrackValue {
  const vector = vectorOf(path);
  if (vector) return shape[vector[0]][vector[1]];
  if (path === 'scale') return shape.scale;
  if (path === 'opacity') return shape.opacity;
  if (path.startsWith('props.')) {
    const key = path.slice('props.'.length);
    const value = shape.props[key] ?? getShapeTypeDef(shape.type).defaults[key];
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  }
  throw new Error(`Not an animatable property: ${path}`);
}

/**
 * The shape with a property's own value set. Only the objects on the way to
 * that property are new; the rest are shared, so unchanged parts keep their
 * identity.
 */
export function writeBase(shape: ShapeData, path: PropertyPath, value: TrackValue | PropValue): ShapeData {
  const vector = vectorOf(path);
  if (vector) {
    const [key, axis] = vector;
    if (shape[key][axis] === value) return shape;
    const next: Vec3 = { ...shape[key], [axis]: value as number };
    return { ...shape, [key]: next };
  }
  if (path === 'scale' || path === 'opacity') {
    return shape[path] === value ? shape : { ...shape, [path]: value as number };
  }
  if (path.startsWith('props.')) {
    const key = path.slice('props.'.length);
    if (shape.props[key] === value) return shape;
    return { ...shape, props: { ...shape.props, [key]: value as PropValue } };
  }
  throw new Error(`Not an animatable property: ${path}`);
}
