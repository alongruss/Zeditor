import { describe, expect, it } from 'vitest';
import { setKey } from '../../model/animation';
import { starterScene } from '../../model/starterScene';
import type { Scene } from '../../model/types';
import type { ViewSpec } from '../../render/view';
import { allFrames, lottieExport, lottieExportInChunks } from './exportScene';

const VIEW: ViewSpec = { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 10, width: 200, height: 120 };

/** The starter scene with its first shape moving over 60 frames. */
function movingScene(): Scene {
  const scene = starterScene();
  const moving = setKey(setKey(scene.shapes[0], 'translate.x', 0, -3), 'translate.x', 59, 3);
  return { ...scene, settings: { ...scene.settings, duration: 60 }, shapes: [moving, ...scene.shapes.slice(1)] };
}

describe('lottieExportInChunks', () => {
  it('gives the same file as working it out in one go, with keys or baked', async () => {
    const scene = movingScene();
    for (const mode of ['keys', 'baked'] as const) {
      const options = { background: true, name: 'scene', frames: allFrames(scene), mode };
      const chunked = await lottieExportInChunks(scene, VIEW, options, new AbortController().signal);
      expect(chunked).toEqual(lottieExport(scene, VIEW, options));
    }
  });

  it('stops when asked, with an AbortError', async () => {
    const scene = movingScene();
    const controller = new AbortController();
    const made = lottieExportInChunks(scene, VIEW, { background: true, name: 'scene', frames: allFrames(scene) }, controller.signal);
    controller.abort();
    await expect(made).rejects.toMatchObject({ name: 'AbortError' });
  });
});
