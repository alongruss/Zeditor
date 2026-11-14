import { DEFAULT_BACKGROUND } from './scene';
import { getShapeTypeDef, type FieldDef } from './shapeTypes';
import {
  SCENE_VERSION,
  SHAPE_TYPES,
  type PathData,
  type PropValue,
  type Scene,
  type ShapeData,
  type ShapeType,
  type Vec3,
} from './types';
import { isHexColor } from './color';
import { parseCssColor } from './cssColor';

/**
 * The `.zeditor.json` file format: the scene data itself, as JSON. Files are
 * also what autosave keeps in the browser, so a file is read with the same
 * checks wherever it comes from. A file is treated as untrusted input: every
 * value is checked, and anything unknown is left out.
 */

export const SCENE_FILE_EXTENSION = '.zeditor.json';

/** Files bigger than this are refused before reading. */
export const MAX_SCENE_FILE_BYTES = 5 * 1024 * 1024;

const MAX_SHAPES = 5000;
const MAX_NAME_LENGTH = 200;
const MAX_PATH_POINTS = 2000;

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

function readShape(raw: unknown, index: number): ShapeData {
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

  return {
    id,
    name,
    type: def.type,
    translate: readVec3(raw.translate, `${where} translate`),
    rotate: readVec3(raw.rotate, `${where} rotate`),
    scale,
    opacity: Math.min(1, Math.max(0, opacity)),
    props,
  };
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
    if (version !== SCENE_VERSION) {
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

    const shapes = data.shapes.map(readShape);
    const ids = new Set<string>();
    for (const shape of shapes) {
      if (ids.has(shape.id)) return fail(`Two shapes have the same id: ${shape.id}.`);
      ids.add(shape.id);
    }

    return { ok: true, scene: { version: SCENE_VERSION, settings: { background }, shapes } };
  } catch (error) {
    if (error instanceof SceneFileError) return { ok: false, error: error.message };
    throw error;
  }
}
