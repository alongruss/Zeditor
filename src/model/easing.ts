import type { Easing } from './types';

/**
 * The easing presets as CSS cubic-bezier curves (x1, y1, x2, y2), so a custom
 * curve, or Lottie's own keyframe handles, can be added later. Hold has no
 * curve: the value jumps at the next key.
 */
export const EASING_CURVES: Readonly<Record<Exclude<Easing, 'hold'>, readonly [number, number, number, number]>> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

export const EASING_LABELS: Readonly<Record<Easing, string>> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  hold: 'Hold',
};

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
  if (easing === 'hold') return 0;
  const time = Math.min(1, Math.max(0, t));
  const [x1, y1, x2, y2] = EASING_CURVES[easing];
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
