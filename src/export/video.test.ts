import { describe, expect, it } from 'vitest';
import { starterScene } from '../model/starterScene';
import type { ViewSpec } from '../render/view';
import { NO_H264, VideoExportError, canMakeVideo, drawFrame, evenSide, evenView, makeVideo } from './video';
import { MAX_VIDEO_SIDE, fitVideoSize } from './videoSize';

const VIEW: ViewSpec = { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 10, width: 321, height: 241 };

describe('even sizes for H.264', () => {
  it('rounds a side down to an even number, and never below 2', () => {
    expect([320, 321, 1, 0, 2, 3, 1079.6].map(evenSide)).toEqual([320, 320, 2, 2, 2, 2, 1080]);
  });

  it('keeps the rest of the view (angle, target, zoom) as it is', () => {
    expect(evenView(VIEW)).toEqual({ ...VIEW, width: 320, height: 240 });
  });
});

describe('fitVideoSize', () => {
  it('scales a picture too big for video down to fit, keeping its shape, with even sides', () => {
    expect(fitVideoSize(8192, 4608)).toEqual({ width: 4096, height: 2304 });
    expect(fitVideoSize(1001, 8192)).toEqual({ width: 500, height: 4096 });
    const { width, height } = fitVideoSize(8191, 8191);
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_VIDEO_SIDE);
    expect(width % 2 + (height % 2)).toBe(0);
  });

  it('leaves a picture that fits at its size (made even)', () => {
    expect(fitVideoSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(fitVideoSize(641, 361)).toEqual({ width: 640, height: 360 });
  });
});

describe('makeVideo', () => {
  it("says so calmly where there's no H.264 encoder (no WebCodecs here)", async () => {
    expect(await canMakeVideo(320, 240, 30)).toBe(false);
    const made = makeVideo(starterScene(), () => VIEW, { frames: [0, 1], fps: 30 });
    await expect(made).rejects.toThrow(VideoExportError);
    await expect(made).rejects.toThrow(NO_H264);
  });

  it('refuses no frames at all', async () => {
    await expect(makeVideo(starterScene(), () => VIEW, { frames: [], fps: 30 })).rejects.toThrow('There are no frames to export.');
  });
});

describe('drawFrame', () => {
  it("sets the canvas up as zdog's Illustration does: background, middle, zoom, round line ends", () => {
    const calls: string[] = [];
    const state: Record<string, unknown> = {};
    let firstStroke: string | null = null;
    const ctx = new Proxy(state, {
      get(target, key) {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key];
        return (...args: unknown[]) => {
          if (['save', 'restore', 'setTransform', 'fillRect', 'translate', 'scale'].includes(key)) {
            calls.push(`${key}(${args.join(', ')})${key === 'fillRect' ? ` ${String(target.fillStyle)}` : ''}`);
          }
          if (key === 'stroke' && firstStroke === null) firstStroke = `${String(target.lineCap)} ${String(target.lineJoin)}`;
        };
      },
      set(target, key, value) {
        target[key as string] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    drawFrame(ctx, starterScene(), { ...VIEW, width: 320, height: 240 }, '#ffddbb');
    expect(calls).toEqual([
      'save()',
      'setTransform(1, 0, 0, 1, 0, 0)',
      'fillRect(0, 0, 320, 240) #ffffff', // under a see-through background
      'fillRect(0, 0, 320, 240) #ffddbb',
      'translate(160, 120)',
      'scale(10, 10)',
      'restore()',
    ]);
    expect(firstStroke).toBe('round round');
  });
});
