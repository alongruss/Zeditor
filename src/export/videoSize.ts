import type { ViewSpec } from '../render/view';

/**
 * The small parts of the video export the dialog needs straight away. The
 * rest (with the MP4 library) loads the first time it's used.
 */

export class VideoExportError extends Error {}

/** What the dialog says when the browser can't make H.264 video. */
export const NO_H264 = "This browser can't make MP4 videos. Chrome, Edge and Safari can.";

/** Biggest picture side a video can have, in pixels (H.264 encoders top out around here). */
export const MAX_VIDEO_SIDE = 4096;

/**
 * A picture size made to fit in a video: scaled down, keeping its shape, so
 * neither side is over MAX_VIDEO_SIDE, and with even sides.
 */
export function fitVideoSize(width: number, height: number): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, MAX_VIDEO_SIDE / Math.max(width, height));
  return { width: evenSide(width * scale), height: evenSide(height * scale) };
}

/** H.264 needs even sides: the nearest even size at or below `n` (2 at least). */
export const evenSide = (n: number): number => Math.max(2, Math.floor(Math.round(n) / 2) * 2);

/** The view at an even picture size: a pixel off an odd side, the middle kept in the middle. */
export const evenView = (view: ViewSpec): ViewSpec => ({ ...view, width: evenSide(view.width), height: evenSide(view.height) });

/** True if this browser can encode H.264 at this size and frame rate (loads the video export to check). */
export async function canMakeVideo(width: number, height: number, fps: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  const video = await import('./video');
  return video.canMakeVideo(width, height, fps);
}
