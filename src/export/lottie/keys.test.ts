import { describe, expect, it } from 'vitest';
import { setKey } from '../../model/animation';
import { sceneAtFrame } from '../../model/evaluate';
import { starterScene } from '../../model/starterScene';
import type { Scene, ShapeData } from '../../model/types';
import { recordFrame, type DrawOp } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { bakeLottie } from './bake';
import { keyIndexes, keyLottie } from './keys';
import type { GroupItem, LottieAnimation, Prop, ShapeLayer } from './lottieJson';

const VIEW: ViewSpec = { rotate: { x: -0.3, y: 0.6, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 8, width: 320, height: 240 };
const OPTIONS = { width: 320, height: 240, fps: 30, background: null, name: 'test' };

/** The starter scene with a slide, a turn (paths change unevenly), a color change and a fade. */
function animated(): Scene {
  let scene = starterScene();
  const edit = (id: string, change: (shape: ShapeData) => ShapeData) => {
    scene = { ...scene, shapes: scene.shapes.map((shape) => (shape.id === id ? change(shape) : shape)) };
  };
  edit('cone-1', (s) => setKey(setKey(s, 'translate.x', 0, s.translate.x), 'translate.x', 89, s.translate.x + 3));
  edit('box-1', (s) => setKey(setKey(s, 'rotate.y', 0, 0), 'rotate.y', 60, 90));
  edit('box-1', (s) => setKey(setKey(s, 'props.color', 30, '#ff0000'), 'props.color', 89, '#0000ff'));
  edit('cone-1', (s) => setKey(setKey(s, 'opacity', 0, 1), 'opacity', 45, 0.3));
  return scene;
}

const record = (scene: Scene, view = VIEW): DrawOp[][] =>
  Array.from({ length: scene.settings.duration }, (_, f) => recordFrame(sceneAtFrame(scene, f), view));

const shapeLayers = (animation: LottieAnimation) => animation.layers.filter((layer): layer is ShapeLayer => layer.ty === 4);

// ----- A small, separate Lottie player: a property's value on a frame (linear and hold keys). -----

const mix = (a: unknown, b: unknown, t: number): unknown => {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(x, b[i], t));
  if (a && typeof a === 'object') return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, mix(v, (b as Record<string, unknown>)[k], t)]));
  return a;
};

function valueOn(prop: Prop<unknown>, frame: number, whole: boolean): unknown {
  if (prop.a === 0) return prop.k;
  const value = (s: readonly unknown[]) => (whole ? s : s[0]);
  const keys = prop.k;
  if (frame <= keys[0].t) return value(keys[0].s);
  for (let j = 0; j < keys.length - 1; j++) {
    const [a, b] = [keys[j], keys[j + 1]];
    if (frame < b.t) return a.h ? value(a.s) : mix(value(a.s), value(b.s), (frame - a.t) / (b.t - a.t));
  }
  return value(keys[keys.length - 1].s);
}

/** The groups shown on a frame, with every property resolved, dropping what doesn't show (as baked). */
function shownOn(animation: LottieAnimation, frame: number): unknown[] {
  const layer = shapeLayers(animation).find((l) => l.ip <= frame && frame < l.op)!;
  return layer.shapes
    .map((group: GroupItem) => ({
      ...group,
      it: group.it
        .map((item) => {
          if (item.ty === 'sh') return { ...item, ks: valueOn(item.ks as Prop<unknown>, frame, false) };
          if (item.ty === 'tr') return item;
          const style = { ...item, c: valueOn(item.c as Prop<unknown>, frame, true), o: valueOn(item.o as Prop<unknown>, frame, false) };
          return item.ty === 'st' ? { ...style, w: valueOn(item.w as Prop<unknown>, frame, false) } : style;
        })
        .filter((item) => !('o' in item && typeof item.o === 'number' && item.o <= 0)),
    }))
    .filter((group) => group.it.some((item) => item.ty === 'fl' || item.ty === 'st'))
    .map((group) => ({ ...group, nm: '' }));
}

/** The baked frame in the same form: still values unwrapped. */
function bakedOn(frames: readonly DrawOp[][], frame: number): unknown[] {
  const [layer] = shapeLayers(bakeLottie([frames[frame]], OPTIONS));
  return layer.shapes.map((group) => ({
    ...group,
    nm: '',
    it: group.it.map((item) => {
      if (item.ty === 'sh') return { ...item, ks: item.ks.k };
      if (item.ty === 'tr') return item;
      const style = { ...item, c: item.c.k, o: item.o.k };
      return item.ty === 'st' ? { ...style, w: item.w.k } : style;
    }),
  }));
}

/** Every number within `tolerance` (colors, 0–1, within 0.0016), everything else equal. */
function expectClose(actual: unknown, expected: unknown, where: string, tolerance = 0.21): void {
  if (typeof expected === 'number') {
    expect(typeof actual, where).toBe('number');
    expect(Math.abs((actual as number) - expected), `${where}: ${String(actual)} vs ${expected}`).toBeLessThanOrEqual(tolerance);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual) && actual.length, where).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${where}[${i}]`, tolerance));
  } else if (expected && typeof expected === 'object') {
    for (const [k, e] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[k], e, `${where}.${k}`, k === 'c' ? 0.0016 : tolerance);
    }
  } else {
    expect(actual, where).toEqual(expected);
  }
}

describe('keyIndexes', () => {
  it('keeps only the ends of a straight line, and a key at each corner', () => {
    expect(keyIndexes([[0], [1], [2], [3]], 0.01)).toEqual([0, 3]);
    expect(keyIndexes([[0], [1], [2], [1], [0]], 0.01)).toEqual([0, 2, 4]);
    expect(keyIndexes([[0, 5]], 0.01)).toEqual([0]);
  });

  it('keeps every value within the tolerance', () => {
    const curve = Array.from({ length: 50 }, (_, i) => [Math.sin(i / 20) * 10, i * i * 0.01]);
    const keys = keyIndexes(curve, 0.1);
    expect(keys.length).toBeLessThan(curve.length / 2);
    for (let k = 0; k < keys.length - 1; k++) {
      const [a, b] = [keys[k], keys[k + 1]];
      for (let f = a; f <= b; f++) {
        curve[f].forEach((value, d) => {
          const line = curve[a][d] + ((curve[b][d] - curve[a][d]) * (f - a)) / (b - a || 1);
          expect(Math.abs(line - value)).toBeLessThanOrEqual(0.1);
        });
      }
    }
  });
});

describe('keyLottie', () => {
  it('shows the same picture as the baked export on every frame, in a much smaller file', () => {
    const scene = animated();
    const frames = record(scene);
    const { animation, breaks } = keyLottie(frames, OPTIONS);
    for (let f = 0; f < frames.length; f++) expectClose(shownOn(animation, f), bakedOn(frames, f), `frame ${f}`);
    const baked = JSON.stringify(bakeLottie(frames, OPTIONS)).length;
    expect(JSON.stringify(animation).length).toBeLessThan(baked / 4);
    // As the box turns, its faces move past the other shapes in the drawing order: a few new layers.
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.length).toBeLessThan(frames.length / 5);
    expect(animation).toMatchObject({ fr: 30, ip: 0, op: frames.length, w: 320, h: 240 });
  });

  it('needs one layer when nothing passes in front of anything', () => {
    const scene = animated();
    const still = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'box-1' ? { ...s, tracks: { 'props.color': s.tracks!['props.color'] } } : s)) };
    const frames = record(still);
    const { animation, breaks } = keyLottie(frames, OPTIONS);
    expect(breaks).toEqual([]);
    expect(shapeLayers(animation)).toHaveLength(1);
    for (let f = 0; f < frames.length; f++) expectClose(shownOn(animation, f), bakedOn(frames, f), `frame ${f}`);
    expect(JSON.stringify(animation).length).toBeLessThan(JSON.stringify(bakeLottie(frames, OPTIONS)).length / 10);
  });

  it('starts a new layer where the drawing order changes, and still matches', () => {
    // The camera goes all the way round: shapes pass in front of each other.
    const scene = animated();
    const turning = Array.from({ length: scene.settings.duration }, (_, f) =>
      recordFrame(sceneAtFrame(scene, f), { ...VIEW, rotate: { x: -0.3, y: (f / scene.settings.duration) * Math.PI * 2, z: 0 } }),
    );
    const { animation, breaks } = keyLottie(turning, OPTIONS);
    expect(breaks.length).toBeGreaterThan(0);
    const layers = shapeLayers(animation);
    expect(layers.map((l) => l.ip)).toEqual([0, ...breaks]);
    for (let f = 0; f < turning.length; f++) expectClose(shownOn(animation, f), bakedOn(turning, f), `frame ${f}`);
  });

  it('holds a key followed by one on the next frame, so a jump happens on the frame', () => {
    const at = (x: number): DrawOp => ({
      subpaths: [{ start: { x, y: 0 }, segments: [{ kind: 'line', to: { x: x + 10, y: 10 } }], closed: false }],
      paints: [{ kind: 'stroke', color: '#000000', width: 2, cap: 'round', join: 'round' }],
    });
    const { animation } = keyLottie([[at(0)], [at(0)], [at(50)], [at(51)], [at(52)]], OPTIONS);
    const path = shapeLayers(animation)[0].shapes[0].it[0];
    expect(path.ty === 'sh' && path.ks.a === 1 && path.ks.k.map((key) => [key.t, key.h ?? 0])).toEqual([[0, 1], [1, 1], [2, 0], [4, 0]]);
  });

  it('starts a new layer when a path gets more points (a shape rebuilt with more sides)', () => {
    const polygon = (points: number): DrawOp => ({
      subpaths: [
        {
          start: { x: 50, y: 0 },
          segments: Array.from({ length: points - 1 }, (_, i) => ({
            kind: 'line' as const,
            to: { x: 50 * Math.cos(((i + 1) * Math.PI * 2) / points), y: 50 * Math.sin(((i + 1) * Math.PI * 2) / points) },
          })),
          closed: true,
        },
      ],
      paints: [{ kind: 'fill', color: '#336699' }],
    });
    const frames = [[polygon(3)], [polygon(3)], [polygon(5)], [polygon(5)]];
    const { animation, breaks } = keyLottie(frames, OPTIONS);
    expect(breaks).toEqual([2]);
    for (let f = 0; f < frames.length; f++) expectClose(shownOn(animation, f), bakedOn(frames, f), `frame ${f}`);
  });

  it('writes a still scene with no keys at all', () => {
    const frames = record(starterScene());
    const { animation } = keyLottie(frames, OPTIONS);
    expect(JSON.stringify(animation)).not.toContain('"a":1');
    expect(shapeLayers(animation)).toHaveLength(1);
    expectClose(shownOn(animation, 40), bakedOn(frames, 40), 'frame 40');
  });
});
