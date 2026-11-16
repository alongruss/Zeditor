import { getShapeTypeDef } from './shapeTypes';
import type { ObjectType, PropertyPath, PropValue, SceneObject, ShapeType, TrackValue, Vec3 } from './types';

/**
 * The one list of what can be animated, used by the evaluator, the editor,
 * the file checks, the Inspector and the exports. Every Inspector value is
 * animatable: position, rotation, scale and opacity on every shape, plus the
 * shape type's own fields; a camera's angle, target and view span.
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

const CAMERA: readonly PropertySpec[] = [
  ...AXES.map((axis): PropertySpec => ({ path: `rotate.${axis}`, label: `Angle ${axis.toUpperCase()}`, kind: 'number' })),
  ...AXES.map((axis): PropertySpec => ({ path: `target.${axis}`, label: `Target ${axis.toUpperCase()}`, kind: 'number' })),
  { path: 'viewSpan', label: 'View span', kind: 'number', min: 0.01 },
];

/** A group moves, turns and scales what is inside it (opacity and colors belong to the shapes). */
const GROUP: readonly PropertySpec[] = TRANSFORM.filter((spec) => spec.path !== 'opacity');

const byType = new Map<ShapeType, readonly PropertySpec[]>();

/** Every animatable property of a shape type (or of a camera), in Inspector order. */
export function propertiesOf(type: ObjectType): readonly PropertySpec[] {
  if (type === 'Camera') return CAMERA;
  if (type === 'Group') return GROUP;
  let list = byType.get(type);
  if (!list) {
    const fields = getShapeTypeDef(type).fields.map((field): PropertySpec => {
      const path = `props.${field.key}`;
      switch (field.kind) {
        case 'number':
          return { path, label: field.label, kind: 'number', min: field.min, max: field.max, integer: field.integer };
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

export function propertySpec(type: ObjectType, path: PropertyPath): PropertySpec | undefined {
  return propertiesOf(type).find((spec) => spec.path === path);
}

type VectorKey = 'translate' | 'rotate' | 'target';
type NumberKey = 'scale' | 'opacity' | 'viewSpan';

const vectorOf = (path: PropertyPath): [VectorKey, Axis] | null => {
  const match = /^(translate|rotate|target)\.([xyz])$/.exec(path);
  return match ? [match[1] as VectorKey, match[2] as Axis] : null;
};

const isNumberKey = (path: PropertyPath): path is NumberKey =>
  path === 'scale' || path === 'opacity' || path === 'viewSpan';

/** A property's own (un-animated) value, on a shape or a camera. */
export function readBase(object: SceneObject, path: PropertyPath): TrackValue {
  const record = object as unknown as Record<string, unknown>;
  const vector = vectorOf(path);
  if (vector) {
    const value = (record[vector[0]] as Vec3 | undefined)?.[vector[1]];
    if (typeof value === 'number') return value;
  } else if (isNumberKey(path)) {
    const value = record[path];
    if (typeof value === 'number') return value;
  } else if (path.startsWith('props.') && object.type !== 'Camera' && object.type !== 'Group') {
    const key = path.slice('props.'.length);
    const value = object.props[key] ?? getShapeTypeDef(object.type).defaults[key];
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  }
  throw new Error(`Not an animatable property of ${object.type}: ${path}`);
}

/**
 * The object with a property's own value set. Only the objects on the way to
 * that property are new; the rest are shared, so unchanged parts keep their
 * identity.
 */
export function writeBase<T extends SceneObject>(object: T, path: PropertyPath, value: TrackValue | PropValue): T {
  const record = object as unknown as Record<string, unknown>;
  const vector = vectorOf(path);
  if (vector) {
    const [key, axis] = vector;
    const current = record[key] as Vec3 | undefined;
    if (!current) throw new Error(`Not an animatable property of ${object.type}: ${path}`);
    if (current[axis] === value) return object;
    return { ...object, [key]: { ...current, [axis]: value as number } };
  }
  if (isNumberKey(path) && path in record) {
    return record[path] === value ? object : { ...object, [path]: value as number };
  }
  if (path.startsWith('props.') && object.type !== 'Camera' && object.type !== 'Group') {
    const key = path.slice('props.'.length);
    if (object.props[key] === value) return object;
    return { ...object, props: { ...object.props, [key]: value as PropValue } };
  }
  throw new Error(`Not an animatable property of ${object.type}: ${path}`);
}
