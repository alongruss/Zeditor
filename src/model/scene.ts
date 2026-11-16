import { findGroup, subtreeIds } from './hierarchy';
import { getShapeTypeDef } from './shapeTypes';
import {
  DEFAULT_DURATION,
  DEFAULT_FPS,
  SCENE_VERSION,
  type CameraData,
  type GroupData,
  type Props,
  type PropValue,
  type Scene,
  type SceneObject,
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
    groups: [],
    cameras: [],
  };
}

export function findShape(scene: Scene, id: string | null): ShapeData | undefined {
  return id === null ? undefined : scene.shapes.find((shape) => shape.id === id);
}

export function findCamera(scene: Scene, id: string | null): CameraData | undefined {
  return id === null ? undefined : scene.cameras.find((camera) => camera.id === id);
}

/** A shape, group or camera by id. */
export function findObject(scene: Scene, id: string | null): SceneObject | undefined {
  return findShape(scene, id) ?? findGroup(scene, id) ?? findCamera(scene, id);
}

/** Every shape, group and camera, in that order. */
export function allObjects(scene: Scene): readonly SceneObject[] {
  return [...scene.shapes, ...scene.groups, ...scene.cameras];
}

/** The scene with some shapes and cameras replaced (by id); the same scene if none change. */
export function replaceObjects(scene: Scene, changed: ReadonlyMap<string, SceneObject>): Scene {
  if (changed.size === 0) return scene;
  const swap = <T extends SceneObject>(list: readonly T[]): readonly T[] => {
    let any = false;
    const next = list.map((item) => {
      const replacement = changed.get(item.id);
      if (!replacement || replacement === item) return item;
      any = true;
      return replacement as T;
    });
    return any ? next : list;
  };
  const shapes = swap(scene.shapes);
  const groups = swap(scene.groups);
  const cameras = swap(scene.cameras);
  return shapes === scene.shapes && groups === scene.groups && cameras === scene.cameras
    ? scene
    : { ...scene, shapes, groups, cameras };
}

/** World units across the picture's shorter side for a new camera at the editor's default zoom. */
export const DEFAULT_VIEW_SPAN = 32;

/**
 * A new camera, named and id'd for `scene` (`camera-1`, ...). It starts from
 * the given view: rotation in degrees, target, view span and picture size.
 */
export function createCamera(
  scene: Scene,
  view: Pick<CameraData, 'rotate' | 'target' | 'viewSpan' | 'width' | 'height'>,
): CameraData {
  let highest = 0;
  for (const camera of scene.cameras) {
    const match = /^camera-(\d+)$/.exec(camera.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const number = highest + 1;
  return {
    id: `camera-${number}`,
    name: `Camera ${number}`,
    type: 'Camera',
    rotate: { ...view.rotate },
    target: { ...view.target },
    viewSpan: view.viewSpan,
    width: view.width,
    height: view.height,
  };
}

export function addCamera(scene: Scene, camera: CameraData): Scene {
  if (findObject(scene, camera.id)) throw new Error(`Id already in scene: ${camera.id}`);
  return { ...scene, cameras: [...scene.cameras, camera] };
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

/** A new, empty group named and id'd for `scene` (`group-1`, ...), at the top level. */
export function createGroup(scene: Scene, patch: Partial<Omit<GroupData, 'id' | 'type'>> = {}): GroupData {
  let highest = 0;
  for (const group of scene.groups) {
    const match = /^group-(\d+)$/.exec(group.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const number = highest + 1;
  return {
    id: `group-${number}`,
    name: `Group ${number}`,
    type: 'Group',
    translate: { ...ORIGIN },
    rotate: { ...ORIGIN },
    scale: 1,
    drawTogether: false,
    ...patch,
  };
}

/** Removes a shape, a camera, or a group with everything inside it. */
export function removeObject(scene: Scene, id: string): Scene {
  if (findShape(scene, id)) return removeShape(scene, id);
  if (findGroup(scene, id)) {
    const gone = subtreeIds(scene, id);
    return {
      ...scene,
      shapes: scene.shapes.filter((shape) => !gone.has(shape.id)),
      groups: scene.groups.filter((group) => !gone.has(group.id)),
    };
  }
  if (!findCamera(scene, id)) return scene;
  return { ...scene, cameras: scene.cameras.filter((camera) => camera.id !== id) };
}

/**
 * Copies a group and everything inside it, in place: fresh ids and names,
 * the same insides. The copy goes right after the original (its groups
 * after the original's, its shapes after the original's last shape).
 */
function duplicateGroup(scene: Scene, id: string): { scene: Scene; id: string | null } {
  const inside = subtreeIds(scene, id);
  const newIds = new Map<string, string>();
  let next = scene;
  const groupCopies: GroupData[] = [];
  for (const group of scene.groups.filter((g) => inside.has(g.id))) {
    const fresh = createGroup({ ...next, groups: [...next.groups, ...groupCopies] });
    newIds.set(group.id, fresh.id);
    groupCopies.push({ ...structuredClone(group), id: fresh.id, name: group.id === id ? fresh.name : group.name });
  }
  const shapeCopies: ShapeData[] = [];
  for (const shape of scene.shapes.filter((s) => inside.has(s.id))) {
    const fresh = createShape({ ...next, shapes: [...next.shapes, ...shapeCopies] }, shape.type);
    newIds.set(shape.id, fresh.id);
    shapeCopies.push({ ...structuredClone(shape), id: fresh.id });
  }
  const remap = <T extends ShapeData | GroupData>(object: T): T =>
    object.parent !== undefined && newIds.has(object.parent) ? { ...object, parent: newIds.get(object.parent) } : object;
  const lastGroup = Math.max(...scene.groups.map((g, i) => (inside.has(g.id) ? i : -1)));
  const lastShape = Math.max(-1, ...scene.shapes.map((s, i) => (inside.has(s.id) ? i : -1)));
  const groups = [...scene.groups];
  groups.splice(lastGroup + 1, 0, ...groupCopies.map(remap));
  const shapes = [...scene.shapes];
  shapes.splice(lastShape === -1 ? shapes.length : lastShape + 1, 0, ...shapeCopies.map(remap));
  next = { ...scene, groups, shapes };
  return { scene: next, id: newIds.get(id) ?? null };
}

/** Copies a shape (see duplicateShape), a group with its insides, or a camera, right after the original. */
export function duplicateObject(scene: Scene, id: string): { scene: Scene; id: string | null } {
  if (findGroup(scene, id)) return duplicateGroup(scene, id);
  const camera = findCamera(scene, id);
  if (!camera) return duplicateShape(scene, id);
  const fresh = createCamera(scene, camera);
  const copy: CameraData = { ...structuredClone(camera), id: fresh.id, name: fresh.name };
  const cameras = [...scene.cameras];
  cameras.splice(scene.cameras.indexOf(camera) + 1, 0, copy);
  return { scene: { ...scene, cameras }, id: copy.id };
}
