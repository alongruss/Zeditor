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
  /** The group this shape is inside (its transform is relative to the group's), if any. */
  readonly parent?: string;
}

/**
 * A group: a transform that its children (shapes and groups) are placed
 * in, so they move, turn and scale together, as zdog's Anchor and Group do.
 */
export interface GroupData {
  /** Permanent, readable id, e.g. `group-1`. */
  readonly id: string;
  readonly name: string;
  readonly type: 'Group';
  readonly translate: Vec3;
  /** Rotation in degrees. */
  readonly rotate: Vec3;
  /** Uniform scale. */
  readonly scale: number;
  /**
   * Draw the children together as one unit, in their own order (zdog's
   * Group), instead of sorting each into the scene by depth (zdog's Anchor).
   */
  readonly drawTogether: boolean;
  readonly parent?: string;
  readonly tracks?: Tracks;
}

/**
 * A camera in the scene: a view of it that can be animated and exported
 * (scenes are drawn as zdog does: no perspective).
 */
export interface CameraData {
  /** Permanent, readable id, e.g. `camera-1`; never the same as a shape's. */
  readonly id: string;
  readonly name: string;
  readonly type: 'Camera';
  /** How the world is turned in the picture, in degrees (x tilts, y turns, z rolls it). */
  readonly rotate: Vec3;
  /** The world point at the center of the picture. */
  readonly target: Vec3;
  /** World units across the picture's shorter side: smaller zooms in. */
  readonly viewSpan: number;
  /** Picture size in pixels (not animatable: a Lottie file has one size). */
  readonly width: number;
  readonly height: number;
  /** Animation, as for shapes (see animatable.ts for the camera's properties). */
  readonly tracks?: Tracks;
}

/** Anything in the scene that can be selected and animated. */
export type SceneObject = ShapeData | GroupData | CameraData;

/** Shapes and groups: what can be placed inside a group. */
export type Placeable = ShapeData | GroupData;

/** A shape type, 'Group' or 'Camera'. */
export type ObjectType = SceneObject['type'];

/** The named easings (presets). "Ease in" starts slowly, as in CSS. */
export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'] as const;
export type EasingPreset = (typeof EASINGS)[number];

/**
 * A custom easing curve, as CSS `cubic-bezier(x1, y1, x2, y2)`: x1 and x2
 * from 0 to 1 (time), y1 and y2 from -1 to 2 (so it can overshoot).
 */
export type EasingCurve = readonly [number, number, number, number];

/** How a keyframe eases into the next one: a preset, or a curve of its own. */
export type Easing = EasingPreset | EasingCurve;

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

/** Version 2 added animation (tracks, fps, duration); version 3 cameras; version 4 groups. */
export const SCENE_VERSION = 4;

export interface Scene {
  readonly version: typeof SCENE_VERSION;
  readonly settings: SceneSettings;
  /** Every shape, in draw order; a shape's `parent` says which group it is in. */
  readonly shapes: readonly ShapeData[];
  /**
   * Every group. A parent's children are its groups (in this order), then
   * its shapes (in theirs); the order matters only inside a group that
   * draws its children together.
   */
  readonly groups: readonly GroupData[];
  readonly cameras: readonly CameraData[];
}
