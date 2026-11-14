import { sceneAtFrame } from '../../model/evaluate';
import type { Scene } from '../../model/types';
import { recordFrame } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { bakeLottie } from './bake';
import type { LottieAnimation } from './lottieJson';

export interface LottieExportOptions {
  /** Draw the scene's background color, or leave the background transparent. */
  readonly background: boolean;
  readonly name: string;
  /** The frames to bake, in order (e.g. all of them, or just the current one). */
  readonly frames: readonly number[];
}

/** Every frame of the scene's animation: 0 to duration - 1. */
export function allFrames(scene: Scene): number[] {
  return Array.from({ length: scene.settings.duration }, (_, i) => i);
}

/**
 * The scene as seen through `view`, baked frame by frame into a Lottie
 * animation at the scene's frame rate. Each frame is the scene as posed on
 * that frame, drawn exactly as zdog draws it.
 */
export function lottieAnimation(scene: Scene, view: ViewSpec, options: LottieExportOptions): LottieAnimation {
  return bakeLottie(
    options.frames.map((frame) => recordFrame(sceneAtFrame(scene, frame), view)),
    {
      width: view.width,
      height: view.height,
      fps: scene.settings.fps,
      background: options.background ? scene.settings.background : null,
      name: options.name,
    },
  );
}

/** One frame (the scene as it is, or as posed on `frame`), as a single-frame Lottie. */
export function lottieStill(
  scene: Scene,
  view: ViewSpec,
  options: { readonly background: boolean; readonly name: string; readonly frame?: number },
): LottieAnimation {
  return lottieAnimation(scene, view, { ...options, frames: [options.frame ?? 0] });
}
