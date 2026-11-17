import { sceneAtFrame } from '../../model/evaluate';
import type { Scene } from '../../model/types';
import { recordFrame } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { bakeLottie } from './bake';
import { keyLottie } from './keys';
import type { LottieAnimation } from './lottieJson';

export interface LottieExportOptions {
  /** Draw the scene's background color, or leave the background transparent. */
  readonly background: boolean;
  readonly name: string;
  /** The frames to bake, in order (e.g. all of them, or just the current one). */
  readonly frames: readonly number[];
  /** Every frame written out (baked, the default), or keys where the picture changes (see keys.ts). */
  readonly mode?: 'baked' | 'keys';
}

/** Every frame of the scene's animation: 0 to duration - 1. */
export function allFrames(scene: Scene): number[] {
  return Array.from({ length: scene.settings.duration }, (_, i) => i);
}

/** One view for every frame, or a view per frame (e.g. through an animated camera). */
export type ViewSource = ViewSpec | ((frame: number) => ViewSpec);

/**
 * The scene as seen through `view`, baked frame by frame into a Lottie
 * animation at the scene's frame rate. Each frame is the scene as posed on
 * that frame, drawn exactly as zdog draws it. The picture's size is the
 * first frame's view's size (a camera's size never changes).
 */
export function lottieAnimation(scene: Scene, view: ViewSource, options: LottieExportOptions): LottieAnimation {
  return lottieExport(scene, view, options).animation;
}

/**
 * As lottieAnimation, and in keys mode also the frames where a new layer
 * starts because the drawing order changes (none when baked).
 */
export function lottieExport(
  scene: Scene,
  view: ViewSource,
  options: LottieExportOptions,
): { readonly animation: LottieAnimation; readonly breaks: readonly number[] } {
  const viewAt = typeof view === 'function' ? view : () => view;
  const size = viewAt(options.frames[0] ?? 0);
  const frames = options.frames.map((frame) => recordFrame(sceneAtFrame(scene, frame), viewAt(frame)));
  const bakeOptions = {
    width: size.width,
    height: size.height,
    fps: scene.settings.fps,
    background: options.background ? scene.settings.background : null,
    name: options.name,
  };
  return options.mode === 'keys' ? keyLottie(frames, bakeOptions) : { animation: bakeLottie(frames, bakeOptions), breaks: [] };
}

/** One frame (the scene as it is, or as posed on `frame`), as a single-frame Lottie. */
export function lottieStill(
  scene: Scene,
  view: ViewSource,
  options: { readonly background: boolean; readonly name: string; readonly frame?: number },
): LottieAnimation {
  return lottieAnimation(scene, view, { ...options, frames: [options.frame ?? 0] });
}
