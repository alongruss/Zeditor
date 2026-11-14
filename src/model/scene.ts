import { getShapeTypeDef } from './shapeTypes';
import {
  DEFAULT_DURATION,
  DEFAULT_FPS,
  SCENE_VERSION,
  type Props,
  type PropValue,
  type Scene,
  type ShapeData,
  type ShapeType,
  type Vec3,
} from './types';

export const DEFAULT_BACKGROUND = '#ffddbb';
export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

export function emptyScene(): Scene {
  return {
    version: SCENE_VERSION,
    settings: { background: DEFAULT_BACKGROUND, fps: DEFAULT_FPS, duration: DEFAULT_DURATION },
    shapes: [],
  };
}

export function findShape(scene: Scene, id: string | null): ShapeData | undefined {
  return id === null ? undefined : scene.shapes.find((shape) => shape.id === id);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Highest number used by an id like `box-3` for this type (0 if none). */
function highestIdNumber(scene: Scene, type: ShapeType): number {
  const pattern = new RegExp(`^${escapeRegExp(getShapeTypeDef(type).idPrefix)}-(\\d+)$`);
  let highest = 0;
  for (const shape of scene.shapes) {
    const match = pattern.exec(shape.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

/**
 * Next free id for a type, e.g. `box-3`. Always one more than the highest
 * existing number, so a deleted shape's id is not handed out again while
 * higher-numbered shapes still exist.
 */
export function nextShapeId(scene: Scene, type: ShapeType): string {
  return `${getShapeTypeDef(type).idPrefix}-${highestIdNumber(scene, type) + 1}`;
}

/** Deep copy, so no two shapes ever share a nested object (e.g. a path). */
function copyProps(props: Readonly<Record<string, PropValue>>): Props {
  return structuredClone(props) as Props;
}

/** A new shape of `type` with default settings, named and id'd for `scene`. */
export function createShape(
  scene: Scene,
  type: ShapeType,
  at: Vec3 = ORIGIN,
): ShapeData {
  const def = getShapeTypeDef(type);
  const number = highestIdNumber(scene, type) + 1;
  return {
    id: `${def.idPrefix}-${number}`,
    name: `${def.label} ${number}`,
    type,
    translate: { ...at },
    rotate: { ...ORIGIN },
    scale: 1,
    opacity: 1,
    props: copyProps(def.defaults),
  };
}

export function addShape(scene: Scene, shape: ShapeData, index = scene.shapes.length): Scene {
  if (findShape(scene, shape.id)) throw new Error(`Shape id already in scene: ${shape.id}`);
  const shapes = [...scene.shapes];
  shapes.splice(index, 0, shape);
  return { ...scene, shapes };
}

export function removeShape(scene: Scene, id: string): Scene {
  if (!findShape(scene, id)) return scene;
  return { ...scene, shapes: scene.shapes.filter((shape) => shape.id !== id) };
}

export interface ShapePatch {
  readonly name?: string;
  readonly translate?: Partial<Vec3>;
  readonly rotate?: Partial<Vec3>;
  readonly scale?: number;
  readonly opacity?: number;
  readonly props?: Readonly<Record<string, PropValue>>;
}

/**
 * Returns a scene where only shape `id` has changed. Every changed level is a
 * new object, so edits to one shape can never leak into another.
 */
export function updateShape(scene: Scene, id: string, patch: ShapePatch): Scene {
  const index = scene.shapes.findIndex((shape) => shape.id === id);
  if (index === -1) return scene;
  const current = scene.shapes[index];
  const next: ShapeData = {
    ...current,
    name: patch.name ?? current.name,
    translate: patch.translate ? { ...current.translate, ...patch.translate } : current.translate,
    rotate: patch.rotate ? { ...current.rotate, ...patch.rotate } : current.rotate,
    scale: patch.scale ?? current.scale,
    opacity: patch.opacity ?? current.opacity,
    props: patch.props ? { ...current.props, ...copyProps(patch.props) } : current.props,
  };
  const shapes = [...scene.shapes];
  shapes[index] = next;
  return { ...scene, shapes };
}

/**
 * Copies shape `id` in place (same position) and inserts it right
 * after the original. Returns the new scene and the copy's id.
 */
export function duplicateShape(scene: Scene, id: string): { scene: Scene; id: string | null } {
  const index = scene.shapes.findIndex((shape) => shape.id === id);
  if (index === -1) return { scene, id: null };
  const original = scene.shapes[index];
  const fresh = createShape(scene, original.type);
  // Everything (animation included) is copied, deeply, so the two never share an object.
  const copy: ShapeData = { ...structuredClone(original), id: fresh.id, name: fresh.name };
  return { scene: addShape(scene, copy, index + 1), id: copy.id };
}
