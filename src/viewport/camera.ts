import { fitZoom } from './fitZoom';

const TAU = Math.PI * 2;

/**
 * How the scene is viewed. It is not part of the scene or the undo history:
 * turning the camera is never an undo step.
 */
export interface Camera {
  /** Rotation of the whole view, in radians (zdog's Illustration `rotate`). */
  readonly rotate: { readonly x: number; readonly y: number };
  /** Zoom relative to the zoom that fits the scene to the viewport (1 = fitted). */
  readonly zoom: number;
}

export const DEFAULT_CAMERA: Camera = { rotate: { x: 0, y: 0 }, zoom: 1 };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

/** How much one pixel of wheel scrolling zooms (exponential, so in and out feel the same). */
const WHEEL_ZOOM_RATE = 0.0015;

export function isDefaultCamera(camera: Camera): boolean {
  return camera.rotate.x === 0 && camera.rotate.y === 0 && camera.zoom === 1;
}

/**
 * The camera after dragging `dx`, `dy` pixels from where a drag started.
 * Same feel as zdog's own dragRotate: dragging across the shorter side of the
 * viewport turns the view all the way round.
 */
export function orbit(start: Camera, dx: number, dy: number, displaySize: number): Camera {
  if (!(displaySize > 0)) return start;
  return {
    ...start,
    rotate: {
      x: start.rotate.x - (dy / displaySize) * TAU,
      y: start.rotate.y - (dx / displaySize) * TAU,
    },
  };
}

/** The camera after a mouse wheel scroll of `deltaY` pixels (negative = zoom in). */
export function zoomByWheel(camera: Camera, deltaY: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * Math.exp(-deltaY * WHEEL_ZOOM_RATE)));
  return zoom === camera.zoom ? camera : { ...camera, zoom };
}

/** Screen pixels per world unit for a viewport of this size, or null before it has a size. */
export function pixelsPerUnit(width: number, height: number, camera: Camera): number | null {
  const fitted = fitZoom(width, height);
  return fitted === null ? null : fitted * camera.zoom;
}
