import { sceneAtFrame } from '../../model/evaluate';
import type { Scene } from '../../model/types';
import { recordFrame } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { bakeLottie } from './bake';
import { cullFrame } from './cull';
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
 * that frame, drawn exactly as zdog draws it, without the paths that can't
 * show in the picture (see cull.ts). The picture's size is the first frame's
 * view's size (a camera's size never changes).
 */
export function lottieAnimation(scene: Scene, view: ViewSource, options: LottieExportOptions): LottieAnimation {
  return lottieExport(scene, view, options).animation;
}

export interface LottieExport {
  readonly animation: LottieAnimation;
  /** With keys: the frames where a new layer starts (see keys.ts). */
  readonly breaks: readonly number[];
  /** With keys: true if they came out bigger than baking, so the file is baked instead. */
  readonly bakedInstead: boolean;
}

/** As lottieAnimation, with what the keys mode did. */
export function lottieExport(scene: Scene, view: ViewSource, options: LottieExportOptions): LottieExport {
  const viewAt = typeof view === 'function' ? view : () => view;
  const size = viewAt(options.frames[0] ?? 0);
  const frames = options.frames.map((frame) => {
    const spec = viewAt(frame);
    return cullFrame(recordFrame(sceneAtFrame(scene, frame), spec), spec.width, spec.height);
  });
  const bakeOptions = {
    width: size.width,
    height: size.height,
    fps: scene.settings.fps,
    background: options.background ? scene.settings.background : null,
    name: options.name,
  };
  if (options.mode !== 'keys') return { animation: bakeLottie(frames, bakeOptions), breaks: [], bakedInstead: false };
  const keyed = keyLottie(frames, bakeOptions);
  return { animation: keyed.animation, breaks: keyed.breaks, bakedInstead: keyed.baked };
}

/** One frame (the scene as it is, or as posed on `frame`), as a single-frame Lottie. */
export function lottieStill(
  scene: Scene,
  view: ViewSource,
  options: { readonly background: boolean; readonly name: string; readonly frame?: number },
): LottieAnimation {
  return lottieAnimation(scene, view, { ...options, frames: [options.frame ?? 0] });
}
