import { describe, expect, it } from 'vitest';
import { DEFAULT_FREE_VIEW, MAX_ZOOM, MIN_ZOOM, isDefaultFreeView, orbit, pixelsPerUnit, zoomByWheel } from './freeView';
import { VIEW_SPAN } from './fitZoom';

describe('orbit', () => {
  it("turns like zdog's dragRotate: a drag across the short side is a full turn", () => {
    const turned = orbit(DEFAULT_FREE_VIEW, 400, 0, 400);
    expect(turned.rotate.y).toBeCloseTo(-Math.PI * 2);
    expect(turned.rotate.x).toBe(0);
    expect(orbit(DEFAULT_FREE_VIEW, 0, 100, 400).rotate.x).toBeCloseTo(-Math.PI / 2);
  });

  it('works from where the drag started, and keeps the zoom', () => {
    const start = { rotate: { x: 1, y: 2 }, zoom: 3 };
    expect(orbit(start, 0, 0, 400)).toEqual(start);
    expect(orbit(start, 10, 10, 400).zoom).toBe(3);
  });

  it('ignores a viewport with no size', () => {
    expect(orbit(DEFAULT_FREE_VIEW, 50, 50, 0)).toBe(DEFAULT_FREE_VIEW);
  });
});

describe('zoomByWheel', () => {
  it('zooms in on scroll up and out on scroll down, evenly', () => {
    const zoomedIn = zoomByWheel(DEFAULT_FREE_VIEW, -100);
    expect(zoomedIn.zoom).toBeGreaterThan(1);
    expect(zoomByWheel(zoomedIn, 100).zoom).toBeCloseTo(1);
  });

  it('stays within limits', () => {
    expect(zoomByWheel(DEFAULT_FREE_VIEW, -1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomByWheel(DEFAULT_FREE_VIEW, 1e6).zoom).toBe(MIN_ZOOM);
    const max = { ...DEFAULT_FREE_VIEW, zoom: MAX_ZOOM };
    expect(zoomByWheel(max, -100)).toBe(max);
  });
});

describe('pixelsPerUnit', () => {
  it('multiplies the fitted zoom by the camera zoom', () => {
    expect(pixelsPerUnit(640, 320, DEFAULT_FREE_VIEW)).toBe(320 / VIEW_SPAN);
    expect(pixelsPerUnit(640, 320, { ...DEFAULT_FREE_VIEW, zoom: 2 })).toBe((2 * 320) / VIEW_SPAN);
    expect(pixelsPerUnit(0, 320, DEFAULT_FREE_VIEW)).toBeNull();
  });
});

it('isDefaultFreeView spots a reset view', () => {
  expect(isDefaultFreeView(DEFAULT_FREE_VIEW)).toBe(true);
  expect(isDefaultFreeView(orbit(DEFAULT_FREE_VIEW, 5, 0, 100))).toBe(false);
});
