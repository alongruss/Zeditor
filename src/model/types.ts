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
  /**
   * Animation: keyframes per property (see animatable.ts for the paths). A
   * property with a track takes its value from the track; the plain field
   * above is then only used again if the track is removed. Omitted when the
   * shape isn't animated.
   */
  readonly tracks?: Tracks;
}

/** How a keyframe eases into the next one. "Ease in" starts slowly, as in CSS. */
export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'] as const;
export type Easing = (typeof EASINGS)[number];

/** A number, a color (hex), or for hold-only properties a boolean. */
export type TrackValue = number | string | boolean;

export interface Keyframe {
  /** A whole frame number, 0 or more. */
  readonly frame: number;
  readonly value: TrackValue;
  /** Shapes the change from this key to the next one. */
  readonly easing: Easing;
}

/** A property path such as 'translate.x', 'rotate.y', 'scale', 'opacity' or 'props.color'. */
export type PropertyPath = string;

/** Keyframes per property, each list sorted by frame with no two keys on one frame. */
export type Tracks = Readonly<Record<PropertyPath, readonly Keyframe[]>>;

export interface SceneSettings {
  readonly background: string;
  /** Frames per second. */
  readonly fps: number;
  /** Length of the animation, in frames (frames 0 to duration - 1). */
  readonly duration: number;
}

export const DEFAULT_FPS = 30;
export const DEFAULT_DURATION = 90;

/** Version 2 added animation (tracks, fps, duration). */
export const SCENE_VERSION = 2;

export interface Scene {
  readonly version: typeof SCENE_VERSION;
  readonly settings: SceneSettings;
  /** Flat list of top-level shapes, in draw order. */
  readonly shapes: readonly ShapeData[];
}
