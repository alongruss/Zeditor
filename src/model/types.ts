/**
 * Scene data: plain, immutable, JSON-friendly objects. The editor's state is
 * built from these; zdog objects and SVG are derived from them, never the
 * other way round.
 */

export const SHAPE_TYPES = [
  'Rect',
  'RoundedRect',
  'Ellipse',
  'Polygon',
  'Shape',
  'Hemisphere',
  'Cylinder',
  'Cone',
  'Box',
] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A zdog path, e.g. `[{ x: -1 }, { x: 1 }, { move: { y: -1 } }]`. Stored as JSON. */
export type PathData = readonly Readonly<Record<string, unknown>>[];

/**
 * A Box face is either its own color, or `true` to use the shape's main color
 * (`false`, a hidden face, is kept if present but not offered in the UI yet).
 */
export type FaceValue = string | boolean;

export type PropValue = number | string | boolean | PathData;

export type Props = Readonly<Record<string, PropValue>>;

export interface ShapeData {
  /** Permanent, readable id, e.g. `box-1`. Never reused within a scene. */
  readonly id: string;
  /** Display name, editable by the user. */
  readonly name: string;
  readonly type: ShapeType;
  readonly translate: Vec3;
  /** Rotation in degrees (converted to radians only when handed to zdog). */
  readonly rotate: Vec3;
  /** Uniform scale. */
  readonly scale: number;
  /**
   * 0 (invisible) to 1 (solid). zdog has no opacity setting, so this is
   * multiplied into the alpha of each of the shape's colors when drawn.
   */
  readonly opacity: number;
  /** Type-specific settings: size, color, stroke, fill, faces... See shapeTypes.ts. */
  readonly props: Props;
}

export interface SceneSettings {
  readonly background: string;
}

export const SCENE_VERSION = 1;

export interface Scene {
  readonly version: typeof SCENE_VERSION;
  readonly settings: SceneSettings;
  /** Flat list of top-level shapes, in draw order. */
  readonly shapes: readonly ShapeData[];
}
