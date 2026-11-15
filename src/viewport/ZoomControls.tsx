import { setFreeView, useFreeView, useLookThrough } from '../state/store';
import { DEFAULT_FREE_VIEW, isDefaultFreeView, MAX_ZOOM, MIN_ZOOM } from './freeView';

/** One click of the zoom buttons zooms by this factor. */
const ZOOM_STEP = 1.25;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * A small pill at the scene's bottom right: zoom out, the zoom level, zoom in,
 * and Reset view. These move the free view; while looking through a camera
 * they are off (the wheel and dragging change the camera itself).
 */
export function ZoomControls() {
  const view = useFreeView();
  const lookingThrough = useLookThrough() !== null;
  const zoomBy = (factor: number) =>
    setFreeView((current) => {
      const zoom = clampZoom(current.zoom * factor);
      return zoom === current.zoom ? current : { ...current, zoom };
    });

  return (
    <div class="zoom-controls" role="group" aria-label="Zoom">
      <button
        type="button"
        class="icon-button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={lookingThrough || view.zoom <= MIN_ZOOM}
        onClick={() => zoomBy(1 / ZOOM_STEP)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" />
        </svg>
      </button>
      {/* Plain text, not <output>: that is a live "status" region, and the notices own that role. */}
      <span class="zoom-level">{Math.round(view.zoom * 100)}%</span>
      <button
        type="button"
        class="icon-button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={lookingThrough || view.zoom >= MAX_ZOOM}
        onClick={() => zoomBy(ZOOM_STEP)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8 3.5v9" />
        </svg>
      </button>
      <button
        type="button"
        class="zoom-reset"
        title="Turn and zoom the view back to the start"
        disabled={lookingThrough || isDefaultFreeView(view)}
        onClick={() => setFreeView(DEFAULT_FREE_VIEW)}
      >
        Reset view
      </button>
    </div>
  );
}
