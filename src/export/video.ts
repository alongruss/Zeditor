import type * as ZdogTypes from 'zdog';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from 'mediabunny';
import { sceneAtFrame } from '../model/evaluate';
import type { Scene } from '../model/types';
import { rootTranslate, type ViewSpec } from '../render/view';
import { buildZdogGraph } from '../render/zdogGraph';
import { Zdog } from '../zdog';
import { NO_H264, VideoExportError, evenSide, evenView } from './videoSize';

/**
 * MP4 video export: each frame drawn with zdog's own canvas renderer through
 * the chosen view (the same picture as the other exports), encoded as H.264
 * by the browser (WebCodecs) and put in an MP4 file with mediabunny.
 */

export { NO_H264, VideoExportError, evenSide, evenView };

/** True if this browser can encode H.264 at this size and frame rate. */
export async function canMakeVideo(width: number, height: number, fps: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo('avc', { width: evenSide(width), height: evenSide(height), frameRate: fps, quality: QUALITY_HIGH });
  } catch {
    return false;
  }
}

/**
 * Draws one frame of `scene` (already posed) through `view` onto `ctx`, over
 * the background color (on white, if it's see-through), as zdog's Illustration does: the middle of the view
 * at the middle of the picture, zoomed, round line ends and corners.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scene: Scene,
  view: ViewSpec,
  background: string,
): void {
  const root: ZdogTypes.Anchor = new Zdog.Anchor({ rotate: view.rotate, translate: rootTranslate(view) });
  buildZdogGraph(scene, root);
  root.updateGraph();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Video has no transparency: a see-through background shows over white, as on a page.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.translate(view.width / 2, view.height / 2);
  ctx.scale(view.pixelsPerUnit, view.pixelsPerUnit);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  root.renderGraphCanvas(ctx as CanvasRenderingContext2D);
  ctx.restore();
}

export interface VideoOptions {
  /** The frames to film, in order; the video plays them at `fps`. */
  readonly frames: readonly number[];
  readonly fps: number;
  /** Called after each frame is added: how many are done, of how many. */
  readonly onProgress?: (done: number, total: number) => void;
  /** Stops the export (it then throws an AbortError). */
  readonly signal?: AbortSignal;
}

/**
 * The scene as an MP4 video through `viewAt` (a view per frame, so a moving
 * camera is followed). The picture is the first frame's view's size, made
 * even. The background is always drawn: video has no transparency.
 */
export async function makeVideo(scene: Scene, viewAt: (frame: number) => ViewSpec, options: VideoOptions): Promise<Blob> {
  const { frames, fps, onProgress, signal } = options;
  if (frames.length === 0) throw new VideoExportError('There are no frames to export.');
  const first = evenView(viewAt(frames[0]));
  const { width, height } = first;
  if (!(await canMakeVideo(width, height, fps))) throw new VideoExportError(NO_H264);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new VideoExportError("Couldn't draw the video's frames here.");

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  try {
    for (let i = 0; i < frames.length; i++) {
      signal?.throwIfAborted();
      const view = { ...viewAt(frames[i]), width, height };
      drawFrame(ctx, sceneAtFrame(scene, frames[i]), view, scene.settings.background);
      await source.add(i / fps, 1 / fps);
      onProgress?.(i + 1, frames.length);
    }
    signal?.throwIfAborted();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
  if (!target.buffer) throw new VideoExportError("The video couldn't be finished.");
  return new Blob([target.buffer], { type: 'video/mp4' });
}
