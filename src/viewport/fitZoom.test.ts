import { describe, expect, it } from 'vitest';
import { VIEW_SPAN, fitZoom } from './fitZoom';

describe('fitZoom', () => {
  it('fits the view span across the shorter side', () => {
    expect(fitZoom(640, 720)).toBe(640 / VIEW_SPAN);
    expect(fitZoom(1200, 300)).toBe(300 / VIEW_SPAN);
    expect(fitZoom(100, 100, 10)).toBe(10);
  });

  it('returns null instead of a zero zoom before the viewport has a size', () => {
    expect(fitZoom(0, 0)).toBeNull();
    expect(fitZoom(0, 600)).toBeNull();
    expect(fitZoom(800, 0)).toBeNull();
  });

  it('returns null for sizes that are not real numbers', () => {
    expect(fitZoom(Number.NaN, 600)).toBeNull();
    expect(fitZoom(-10, 600)).toBeNull();
    expect(fitZoom(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('returns null for a span that would divide by zero', () => {
    expect(fitZoom(800, 600, 0)).toBeNull();
    expect(fitZoom(800, 600, -5)).toBeNull();
  });
});
