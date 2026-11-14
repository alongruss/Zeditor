import type { Scene } from '../../model/types';
import { recordFrame } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { bakeLottie } from './bake';
import type { LottieAnimation } from './lottieJson';

/** Frame rate written into a still export (it has a single frame). */
export const STILL_FPS = 30;

export interface StillExportOptions {
  /** Draw the scene's background color, or leave the background transparent. */
  readonly background: boolean;
  readonly name: string;
}

/** The scene as seen through `view`, as a one-frame Lottie. */
export function lottieStill(scene: Scene, view: ViewSpec, options: StillExportOptions): LottieAnimation {
  return bakeLottie([recordFrame(scene, view)], {
    width: view.width,
    height: view.height,
    fps: STILL_FPS,
    background: options.background ? scene.settings.background : null,
    name: options.name,
  });
}
