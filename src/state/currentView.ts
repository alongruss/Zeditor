import { objectAtFrame } from '../model/evaluate';
import { findCamera } from '../model/scene';
import type { CameraData } from '../model/types';
import { lookThroughView, viewFromFreeView, type ViewSpec } from '../render/view';
import { editor, freeView, lookThrough } from './store';
import { currentFrame } from './timeline';

/**
 * The camera being looked through, as posed on `frame` (the playhead's by
 * default), or null for the free view.
 */
export function lookedThroughCamera(frame = currentFrame()): CameraData | null {
  const camera = findCamera(editor.get().scene, lookThrough.get());
  return camera ? objectAtFrame(camera, frame) : null;
}

/**
 * The view the viewport shows, over a `width` x `height` area: through the
 * camera being looked through (its picture letterboxed in the middle), or the
 * free view, at `frame` (the playhead's by default; while playing, the moment
 * on screen). Null before the area has a size.
 */
export function currentViewSpec(width: number, height: number, frame = currentFrame()): ViewSpec | null {
  if (!(width > 0 && height > 0)) return null;
  const camera = lookedThroughCamera(frame);
  return camera ? lookThroughView(camera, width, height) : viewFromFreeView(freeView.get(), width, height);
}
