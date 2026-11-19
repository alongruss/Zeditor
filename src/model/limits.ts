/**
 * The one set of limits for every value in a scene. The Inspector, dragging,
 * the timeline, the scene file reader and the check every edit goes through
 * (repair.ts) all use these, so anything the editor holds can be saved and
 * opened again, and no value is big enough to freeze the tab.
 */

/** Furthest a position or camera target can be from the origin, on each axis. */
export const MAX_POSITION = 100000;
/** Biggest angle, in degrees, either way (many turns: plenty for spins). */
export const MAX_ANGLE = 100000;
/** Biggest scale. */
export const MAX_SCALE = 1000;
/** Biggest width, height, diameter, length, radius or corner radius. */
export const MAX_SIZE = 100000;
/** Thickest stroke. */
export const MAX_STROKE = 10000;
/** Fewest and most sides of a polygon (zdog builds every side, so very many would freeze the tab). */
export const MIN_SIDES = 3;
export const MAX_SIDES = 100;
/** How much a camera can show across. */
export const MIN_VIEW_SPAN = 0.01;
export const MAX_VIEW_SPAN = 1000000;
/** A camera's picture size, in pixels. */
export const MAX_PICTURE_SIZE = 8192;
/** The longest animation, and so the last frame a key can be on. */
export const MAX_FRAME = 100000;
export const MAX_FPS = 120;
/** Longest name for a shape, group or camera, in characters. */
export const MAX_NAME_LENGTH = 200;

export interface NumberLimits {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

export const POSITION: NumberLimits = { min: -MAX_POSITION, max: MAX_POSITION };
export const ANGLE: NumberLimits = { min: -MAX_ANGLE, max: MAX_ANGLE };
export const SCALE: NumberLimits = { min: 0, max: MAX_SCALE };
export const OPACITY: NumberLimits = { min: 0, max: 1 };
export const VIEW_SPAN: NumberLimits = { min: MIN_VIEW_SPAN, max: MAX_VIEW_SPAN };
export const PICTURE_SIZE: NumberLimits = { min: 1, max: MAX_PICTURE_SIZE, integer: true };
export const LENGTH: NumberLimits = { min: 1, max: MAX_FRAME, integer: true };
export const FPS: NumberLimits = { min: 1, max: MAX_FPS, integer: true };

/**
 * `value` within `limits`: clamped, rounded if whole numbers are needed, and
 * `fallback` if it isn't a finite number at all.
 */
export function clampTo(value: number, limits: NumberLimits, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(limits.max, Math.max(limits.min, finite));
  return limits.integer ? Math.round(clamped) : clamped;
}
