import type { Easing, EasingCurve, EasingPreset } from './types';

/**
 * The easing presets as CSS cubic-bezier curves (x1, y1, x2, y2), the same
 * form as a custom curve. Hold has no curve: the value jumps at the next key.
 */
export const EASING_CURVES: Readonly<Record<Exclude<EasingPreset, 'hold'>, EasingCurve>> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

export const EASING_LABELS: Readonly<Record<EasingPreset, string>> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  hold: 'Hold',
};

/** Limits of a custom curve's handles: time (x) stays in the segment; the value (y) may overshoot. */
export const CURVE_X = [0, 1] as const;
export const CURVE_Y = [-1, 2] as const;

export const isCurve = (easing: Easing): easing is EasingCurve => typeof easing !== 'string';

/** An easing's curve (a preset's own, or a custom one), or null for hold. */
export function curveOf(easing: Easing): EasingCurve | null {
  if (isCurve(easing)) return easing;
  return easing === 'hold' ? null : EASING_CURVES[easing];
}

/** "Ease in", or "Custom curve". */
export const easingLabel = (easing: Easing): string => (isCurve(easing) ? 'Custom curve' : EASING_LABELS[easing]);

/** The same easing (custom curves compare by their numbers). */
export const sameEasing = (a: Easing, b: Easing): boolean =>
  a === b || (isCurve(a) && isCurve(b) && a.every((n, i) => n === b[i]));

/** A custom curve if `value` is one that fits the limits, else null (for reading files). */
export function readCurve(value: unknown): EasingCurve | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = value as number[];
  const inX = (x: number) => x >= CURVE_X[0] && x <= CURVE_X[1];
  const inY = (y: number) => y >= CURVE_Y[0] && y <= CURVE_Y[1];
  return inX(x1) && inX(x2) && inY(y1) && inY(y2) ? [x1, y1, x2, y2] : null;
}

/** True if the curve can take a value past either key (a handle above 1 or below 0). */
export const overshoots = (easing: Easing): boolean =>
  isCurve(easing) && (easing[1] < 0 || easing[1] > 1 || easing[3] < 0 || easing[3] > 1);

/** One coordinate of a cubic bezier from (0,0) to (1,1) with handles p1, p2, at parameter s. */
const bezier = (p1: number, p2: number, s: number) => {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
};

const bezierSlope = (p1: number, p2: number, s: number) => {
  const u = 1 - s;
  return 3 * u * u * p1 + 6 * u * s * (p2 - p1) + 3 * s * s * (1 - p2);
};

/**
 * How far (0–1) the value has gone from one key to the next, at time t (0–1)
 * between them.
 */
export function ease(easing: Easing, t: number): number {
  const curve = curveOf(easing);
  if (!curve) return 0; // hold
  const time = Math.min(1, Math.max(0, t));
  const [x1, y1, x2, y2] = curve;
  if (x1 === y1 && x2 === y2) return time; // a straight line

  // Find s where the curve's x equals the time: Newton's method, then halving if it strays.
  let s = time;
  for (let i = 0; i < 8; i++) {
    const error = bezier(x1, x2, s) - time;
    if (Math.abs(error) < 1e-7) return bezier(y1, y2, s);
    const slope = bezierSlope(x1, x2, s);
    if (Math.abs(slope) < 1e-6) break;
    s -= error / slope;
  }
  let low = 0;
  let high = 1;
  s = time;
  for (let i = 0; i < 40; i++) {
    const x = bezier(x1, x2, s);
    if (Math.abs(x - time) < 1e-7) break;
    if (x < time) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return bezier(y1, y2, s);
}
