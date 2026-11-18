import { readCurve } from './easing';
import { propertySpec, type PropertySpec } from './animatable';
import { MAX_DEPTH } from './hierarchy';
import { MAX_FPS, MAX_FRAME, MAX_PICTURE_SIZE, MAX_VIEW_SPAN } from './limits';
import { cleanName } from './names';
import { repairScene } from './repair';
import { DEFAULT_BACKGROUND } from './scene';
import { getShapeTypeDef, type FieldDef } from './shapeTypes';
import {
  DEFAULT_DURATION,
  DEFAULT_FPS,
  EASINGS,
  SCENE_VERSION,
  SHAPE_TYPES,
  type CameraData,
  type Easing,
  type GroupData,
  type Keyframe,
  type ObjectType,
  type PathData,
  type PropValue,
  type Scene,
  type ShapeData,
  type ShapeType,
  type TrackValue,
  type Tracks,
  type Vec3,
} from './types';
import { isHexColor } from './color';
import { parseCssColor } from './cssColor';

/**
 * The `.zeditor.json` file format: the scene data itself, as JSON. Files are
 * also what autosave keeps in the browser, so a file is read with the same
 * checks wherever it comes from. A file is treated as untrusted input: every
 * value is checked, and anything unknown is left out.
 *
 * Versions: 1 (the first), 2 (adds animation: tracks, fps, duration), 3 (adds
 * cameras). Older
 * files are read and brought up to date; newer ones are refused, so nothing
 * a newer version saved is ever silently dropped.
 */

export const SCENE_FILE_EXTENSION = '.zeditor.json';

/** Files bigger than this are refused before reading. */
export const MAX_SCENE_FILE_BYTES = 5 * 1024 * 1024;

const MAX_SHAPES = 5000;
const MAX_PATH_POINTS = 2000;
const MAX_KEYS = 10000;

export type SceneFileResult = { readonly ok: true; readonly scene: Scene } | { readonly ok: false; readonly error: string };

export function serializeScene(scene: Scene): string {
  return `${JSON.stringify(scene, null, 2)}\n`;
}

const NOT_A_SCENE = "This isn't a Zeditor scene file.";

class SceneFileError extends Error {}

const fail = (message: string): never => {
  throw new SceneFileError(message);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * A color zdog can draw and the exports can read: hex, a CSS color name, or
 * rgb()/hsl() with plain numbers. Nothing else, so a file can't sneak in
 * url(...) or script.
 */
export function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && parseCssColor(value) !== null;
}

/** A zdog path: a list of points and commands made only of numbers. */
function isPathData(value: unknown): value is PathData {
  const numbersOnly = (node: unknown, depth: number): boolean => {
    if (isFiniteNumber(node)) return true;
    if (depth > 3) return false;
    if (Array.isArray(node)) return node.length <= 4 && node.every((item) => numbersOnly(item, depth + 1));
    if (isRecord(node)) return Object.values(node).every((item) => numbersOnly(item, depth + 1));
    return false;
  };
  return (
    Array.isArray(value) &&
    value.length <= MAX_PATH_POINTS &&
    value.every((point) => isRecord(point) && numbersOnly(point, 0))
  );
}

function readVec3(value: unknown, where: string): Vec3 {
  if (value === undefined) return { x: 0, y: 0, z: 0 };
  if (!isRecord(value)) return fail(`${where} isn't an {x, y, z} value.`);
  const axis = (key: 'x' | 'y' | 'z') => {
    const n = value[key] ?? 0;
    return isFiniteNumber(n) ? n : fail(`${where}.${key} isn't a number.`);
  };
  return { x: axis('x'), y: axis('y'), z: axis('z') };
}

/** A prop value checked against what its field (or, for `path`, its default) expects. */
function readProp(key: string, value: unknown, field: FieldDef | undefined, where: string): PropValue {
  const bad = () => fail(`${where}: "${key}" has a value that doesn't fit.`);
  if (key === 'path') return isPathData(value) ? structuredClone(value) : bad();
  switch (field?.kind) {
    case 'number':
      return isFiniteNumber(value) &&
        value >= field.min &&
        (field.max === undefined || value <= field.max) &&
        (!field.integer || Number.isInteger(value))
        ? value
        : bad();
    case 'color':
      return isSafeColor(value) ? value : bad();
    case 'boolean':
      return typeof value === 'boolean' ? value : bad();
    case 'face':
      return typeof value === 'boolean' || isSafeColor(value) ? value : bad();
    default:
      return bad();
  }
}

function readKeyValue(value: unknown, spec: PropertySpec): TrackValue | null {
  switch (spec.kind) {
    case 'number':
      if (!isFiniteNumber(value)) return null;
      if (spec.min !== undefined && value < spec.min) return null;
      if (spec.max !== undefined && value > spec.max) return null;
      if (spec.integer && !Number.isInteger(value)) return null;
      return value;
    case 'color':
      return isSafeColor(value) ? value : null;
    case 'face':
      return typeof value === 'boolean' || isSafeColor(value) ? value : null;
    case 'hold':
      return typeof value === 'boolean' ? value : null;
  }
}

/** A shape's animation tracks, every key checked against its property's rules. */
function readTracks(raw: unknown, type: ObjectType, where: string): Tracks | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return fail(`${where}: tracks isn't an object.`);
  const tracks: Record<string, readonly Keyframe[]> = {};
  for (const [path, rawKeys] of Object.entries(raw)) {
    const spec = propertySpec(type, path);
    if (!spec) return fail(`${where}: "${path}" can't be animated.`);
    if (!Array.isArray(rawKeys) || rawKeys.length === 0 || rawKeys.length > MAX_KEYS) {
      return fail(`${where}: the "${path}" track has no keys, or too many.`);
    }
    const keys = rawKeys.map((rawKey): Keyframe => {
      if (!isRecord(rawKey)) return fail(`${where}: a "${path}" key isn't a keyframe.`);
      const frame = rawKey.frame;
      if (!isFiniteNumber(frame) || !Number.isInteger(frame) || frame < 0 || frame > MAX_FRAME) {
        return fail(`${where}: a "${path}" key has no valid frame.`);
      }
      const value = readKeyValue(rawKey.value, spec);
      if (value === null) return fail(`${where}: the "${path}" key at frame ${frame} has a value that doesn't fit.`);
      const rawEasing = rawKey.easing ?? 'easeInOut';
      const easing = (EASINGS as readonly unknown[]).includes(rawEasing) ? (rawEasing as Easing) : readCurve(rawEasing);
      if (easing === null) {
        return fail(`${where}: the "${path}" key at frame ${frame} has an unknown easing.`);
      }
      return { frame, value, easing };
    });
    keys.sort((a, b) => a.frame - b.frame);
    for (let i = 1; i < keys.length; i++) {
      if (keys[i].frame === keys[i - 1].frame) return fail(`${where}: two "${path}" keys are on frame ${keys[i].frame}.`);
    }
    tracks[path] = keys;
  }
  return Object.keys(tracks).length > 0 ? tracks : undefined;
}

/** A whole number setting within limits; the default when it's missing. */
function readWholeSetting(value: unknown, name: string, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1 || value > max) {
    return fail(`The scene's ${name} must be a whole number from 1 to ${max}.`);
  }
  return value;
}

const MAX_CAMERAS = 100;

function readCamera(raw: unknown, index: number): CameraData {
  const where = `Camera ${index + 1}`;
  if (!isRecord(raw)) return fail(`${where} isn't a camera.`);
  const id = raw.id;
  if (typeof id !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(id)) return fail(`${where} has no valid id.`);
  const name = (typeof raw.name === 'string' && cleanName(raw.name)) || id;
  const viewSpan = raw.viewSpan;
  if (!isFiniteNumber(viewSpan) || viewSpan <= 0 || viewSpan > MAX_VIEW_SPAN) {
    return fail(`${where}: the view span must be a number above 0.`);
  }
  const side = (value: unknown, label: string): number =>
    isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= MAX_PICTURE_SIZE
      ? value
      : fail(`${where}: the picture ${label} must be a whole number from 1 to ${MAX_PICTURE_SIZE}.`);
  const camera: CameraData = {
    id,
    name,
    type: 'Camera',
    rotate: readVec3(raw.rotate, `${where} rotate`),
    target: readVec3(raw.target, `${where} target`),
    viewSpan,
    width: side(raw.width, 'width'),
    height: side(raw.height, 'height'),
  };
  const tracks = readTracks(raw.tracks, 'Camera', where);
  return tracks ? { ...camera, tracks } : camera;
}

const MAX_GROUPS = 5000;

/** An object's `parent` (a group id), read now and checked once every group is known. */
function readParent(raw: Record<string, unknown>, where: string): string | undefined {
  const parent = raw.parent;
  if (parent === undefined) return undefined;
  if (typeof parent !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(parent)) return fail(`${where} has an invalid group.`);
  return parent;
}

function readGroup(raw: unknown, index: number): GroupData {
  const where = `Group ${index + 1}`;
  if (!isRecord(raw)) return fail(`${where} isn't a group.`);
  const id = raw.id;
  if (typeof id !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(id)) return fail(`${where} has no valid id.`);
  const name = (typeof raw.name === 'string' && cleanName(raw.name)) || id;
  const scale = raw.scale ?? 1;
  if (!isFiniteNumber(scale) || scale < 0) return fail(`${where}: scale isn't a number of 0 or more.`);
  const parent = readParent(raw, where);
  const group: GroupData = {
    id,
    name,
    type: 'Group',
    translate: readVec3(raw.translate, `${where} translate`),
    rotate: readVec3(raw.rotate, `${where} rotate`),
    scale,
    drawTogether: raw.drawTogether === true,
    ...(parent ? { parent } : {}),
  };
  const tracks = readTracks(raw.tracks, 'Group', where);
  return tracks ? { ...group, tracks } : group;
}

/** Every `parent` names a group, and no group is inside itself (directly or not). */
function checkHierarchy(shapes: readonly ShapeData[], groups: readonly GroupData[]): void {
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const object of [...groups, ...shapes]) {
    if (object.parent !== undefined && !byId.has(object.parent)) {
      fail(`"${object.name}" is in a group that isn't in the scene (${object.parent}).`);
    }
  }
  for (const group of groups) {
    let depth = 0;
    let parent = group.parent === undefined ? undefined : byId.get(group.parent);
    while (parent) {
      if (parent.id === group.id) fail(`The group "${group.name}" is inside itself.`);
      if (++depth > MAX_DEPTH) fail(`Groups are nested more than ${MAX_DEPTH} deep.`);
      parent = parent.parent === undefined ? undefined : byId.get(parent.parent);
    }
  }
}

function readShape(raw: unknown, index: number, version: number): ShapeData {
  const where = `Shape ${index + 1}`;
  if (!isRecord(raw)) return fail(`${where} isn't a shape.`);

  const type = raw.type;
  if (typeof type !== 'string' || !(SHAPE_TYPES as readonly string[]).includes(type)) {
    return fail(`${where} has an unknown type: ${JSON.stringify(type)}.`);
  }
  const def = getShapeTypeDef(type as ShapeType);

  const id = raw.id;
  if (typeof id !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(id)) return fail(`${where} has no valid id.`);

  const name = (typeof raw.name === 'string' && cleanName(raw.name)) || id;
  const scale = raw.scale ?? 1;
  if (!isFiniteNumber(scale) || scale < 0) return fail(`${where}: scale isn't a number of 0 or more.`);
  const opacity = raw.opacity ?? 1;
  if (!isFiniteNumber(opacity)) return fail(`${where}: opacity isn't a number.`);

  // Only the props this type knows; missing ones get the type's default.
  const rawProps = raw.props === undefined ? {} : raw.props;
  if (!isRecord(rawProps)) return fail(`${where}: props isn't an object.`);
  const props: Record<string, PropValue> = {};
  for (const [key, fallback] of Object.entries(def.defaults)) {
    const field = def.fields.find((f) => f.key === key);
    props[key] = Object.hasOwn(rawProps, key) ? readProp(key, rawProps[key], field, where) : structuredClone(fallback);
  }

  const shape: ShapeData = {
    id,
    name,
    type: def.type,
    translate: readVec3(raw.translate, `${where} translate`),
    rotate: readVec3(raw.rotate, `${where} rotate`),
    scale,
    opacity: Math.min(1, Math.max(0, opacity)),
    props,
  };
  // Version 4 added groups.
  const parent = version >= 4 ? readParent(raw, where) : undefined;
  if (parent) Object.assign(shape, { parent });
  // Version 1 had no animation.
  const tracks = version >= 2 ? readTracks(raw.tracks, def.type, where) : undefined;
  return tracks ? { ...shape, tracks } : shape;
}

/** Reads a scene file's text, checking everything. Never throws. */
export function parseSceneFile(text: string): SceneFileResult {
  try {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return fail(`${NOT_A_SCENE} (It isn't valid JSON.)`);
    }
    if (!isRecord(data) || !Array.isArray(data.shapes)) return fail(NOT_A_SCENE);

    const version = data.version;
    if (version !== SCENE_VERSION && version !== 1 && version !== 2 && version !== 3) {
      if (isFiniteNumber(version) && version > SCENE_VERSION) {
        return fail(
          `This scene was saved by a newer version of Zeditor (file version ${version}). ` +
            `This version opens file version ${SCENE_VERSION}.`,
        );
      }
      return fail(`${NOT_A_SCENE} (Unknown file version: ${JSON.stringify(version)}.)`);
    }
    if (data.shapes.length > MAX_SHAPES) return fail(`This scene has more than ${MAX_SHAPES} shapes.`);

    const settings = isRecord(data.settings) ? data.settings : {};
    const background = isHexColor(String(settings.background ?? '')) ? String(settings.background) : DEFAULT_BACKGROUND;
    const fps = version >= 2 ? readWholeSetting(settings.fps, 'fps', DEFAULT_FPS, MAX_FPS) : DEFAULT_FPS;
    const duration =
      version >= 2 ? readWholeSetting(settings.duration, 'length', DEFAULT_DURATION, MAX_FRAME) : DEFAULT_DURATION;

    const shapes = data.shapes.map((raw, i) => readShape(raw, i, version));
    // Version 3 added cameras.
    const rawCameras = version >= 3 && data.cameras !== undefined ? data.cameras : [];
    if (!Array.isArray(rawCameras)) return fail(`The scene's cameras aren't a list.`);
    if (rawCameras.length > MAX_CAMERAS) return fail(`This scene has more than ${MAX_CAMERAS} cameras.`);
    const cameras = rawCameras.map(readCamera);
    // Version 4 added groups.
    const rawGroups = version >= 4 && data.groups !== undefined ? data.groups : [];
    if (!Array.isArray(rawGroups)) return fail(`The scene's groups aren't a list.`);
    if (rawGroups.length > MAX_GROUPS) return fail(`This scene has more than ${MAX_GROUPS} groups.`);
    const groups = rawGroups.map(readGroup);
    const ids = new Set<string>();
    for (const object of [...shapes, ...groups, ...cameras]) {
      if (ids.has(object.id)) return fail(`Two objects have the same id: ${object.id}.`);
      ids.add(object.id);
    }
    checkHierarchy(shapes, groups);

    // Within the editor's limits, as every edit is (positions, angles and the like are clamped).
    const scene: Scene = { version: SCENE_VERSION, settings: { background, fps, duration }, shapes, groups, cameras };
    return { ok: true, scene: repairScene(scene) };
  } catch (error) {
    if (error instanceof SceneFileError) return { ok: false, error: error.message };
    throw error;
  }
}
