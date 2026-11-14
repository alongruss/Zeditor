import { propertySpec, type PropertySpec } from './animatable';
import { DEFAULT_BACKGROUND } from './scene';
import { getShapeTypeDef, type FieldDef } from './shapeTypes';
import {
  DEFAULT_DURATION,
  DEFAULT_FPS,
  EASINGS,
  SCENE_VERSION,
  SHAPE_TYPES,
  type Easing,
  type Keyframe,
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
 * Versions: 1 (the first), 2 (adds animation: tracks, fps, duration). Older
 * files are read and brought up to date; newer ones are refused, so nothing
 * a newer version saved is ever silently dropped.
 */

export const SCENE_FILE_EXTENSION = '.zeditor.json';

/** Files bigger than this are refused before reading. */
export const MAX_SCENE_FILE_BYTES = 5 * 1024 * 1024;

const MAX_SHAPES = 5000;
const MAX_NAME_LENGTH = 200;
const MAX_PATH_POINTS = 2000;
const MAX_KEYS = 10000;
const MAX_FRAME = 100000;
const MAX_FPS = 120;

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
      return isFiniteNumber(value) && value >= field.min && (!field.integer || Number.isInteger(value)) ? value : bad();
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
function readTracks(raw: unknown, type: ShapeType, where: string): Tracks | undefined {
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
      const easing = rawKey.easing ?? 'easeInOut';
      if (!(EASINGS as readonly unknown[]).includes(easing)) {
        return fail(`${where}: the "${path}" key at frame ${frame} has an unknown easing.`);
      }
      return { frame, value, easing: easing as Easing };
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

  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim().slice(0, MAX_NAME_LENGTH) : id;
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
    if (version !== SCENE_VERSION && version !== 1) {
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
    const ids = new Set<string>();
    for (const shape of shapes) {
      if (ids.has(shape.id)) return fail(`Two shapes have the same id: ${shape.id}.`);
      ids.add(shape.id);
    }

    return { ok: true, scene: { version: SCENE_VERSION, settings: { background, fps, duration }, shapes } };
  } catch (error) {
    if (error instanceof SceneFileError) return { ok: false, error: error.message };
    throw error;
  }
}
