import { describe, expect, it } from 'vitest';
import { starterScene } from '../../model/starterScene';
import { arcSegments, type DrawOp } from '../../render/drawOps';
import type { ViewSpec } from '../../render/view';
import { LottieExportError, bakeLottie, channel, toBezier, toGroup } from './bake';
import { lottieStill } from './exportScene';
import type { FillItem, ShapeLayer, SolidLayer, StrokeItem } from './lottieJson';

const OPTIONS = { width: 200, height: 100, fps: 30, background: null, name: 'test' };

const square = (color: string, paints: DrawOp['paints'] = [{ kind: 'fill', color }]): DrawOp => ({
  subpaths: [
    {
      start: { x: 0, y: 0 },
      segments: [
        { kind: 'line', to: { x: 10, y: 0 } },
        { kind: 'line', to: { x: 10, y: 10 } },
        { kind: 'line', to: { x: 0, y: 10 } },
      ],
      closed: true,
    },
  ],
  paints,
});

const shapeLayers = (layers: readonly (ShapeLayer | SolidLayer)[]) =>
  layers.filter((layer): layer is ShapeLayer => layer.ty === 4);

describe('toBezier', () => {
  it('writes vertices with tangents relative to them', () => {
    const bezier = toBezier({
      start: { x: 0, y: 0 },
      segments: [{ kind: 'bezier', c1: { x: 1, y: 2 }, c2: { x: 8, y: 9 }, to: { x: 10, y: 10 } }],
      closed: false,
    });
    expect(bezier).toEqual({ c: false, v: [[0, 0], [10, 10]], i: [[0, 0], [-2, -1]], o: [[1, 2], [0, 0]] });
  });

  it('folds the repeated end of a closed curve (a circle) into its first vertex', () => {
    const { start, segments } = arcSegments(0, 0, 10, 0, Math.PI * 2, false);
    const bezier = toBezier({ start, segments, closed: true });
    expect(bezier.v).toHaveLength(4);
    expect(bezier.i[0]).not.toEqual([0, 0]); // the last quarter's in-tangent
  });
});

describe('toGroup', () => {
  it('lists the fill before the stroke, so the fill is drawn on top as in zdog', () => {
    const group = toGroup(
      square('#ff0000', [
        { kind: 'stroke', color: '#ff0000', width: 4, cap: 'round', join: 'round' },
        { kind: 'fill', color: '#ff0000' },
      ]),
      'g',
    )!;
    expect(group.it.map((item) => item.ty)).toEqual(['sh', 'fl', 'st', 'tr']);
    const stroke = group.it[2] as StrokeItem;
    expect(stroke).toMatchObject({ w: { k: 4 }, lc: 2, lj: 2 });
  });

  it('puts color alpha into the opacity, as players ignore alpha in colors', () => {
    const fill = toGroup(square('#33aa6633'), 'g')!.it[1] as FillItem;
    expect(fill.c.k.map((c) => Math.floor(c * 255))).toEqual([0x33, 0xaa, 0x66]);
    expect(fill.o.k).toBe(20);
  });

  it('leaves out invisible paint, and paths with nothing left to show', () => {
    expect(toGroup(square('transparent'), 'g')).toBeNull();
  });

  it('refuses a color it cannot read', () => {
    expect(() => toGroup(square('bogus'), 'g')).toThrow(LottieExportError);
  });
});

describe('channel', () => {
  // lottie-web rounds down (bmFloor); other players round to nearest.
  it('comes back as the same 0-255 value whether a player rounds down or to nearest', () => {
    for (let n = 0; n <= 255; n++) {
      expect(Math.floor(channel(n) * 255), `floor ${n}`).toBe(n);
      expect(Math.round(channel(n) * 255), `round ${n}`).toBe(n);
    }
  });
});

describe('bakeLottie', () => {
  it('writes the fields players need', () => {
    const lottie = bakeLottie([[square('#ff0000')]], OPTIONS);
    expect(lottie).toMatchObject({ v: '5.7.0', fr: 30, ip: 0, op: 1, w: 200, h: 100, ddd: 0, assets: [] });
    for (const layer of lottie.layers) {
      // lottie-web never shows a layer without a start time.
      expect(layer).toMatchObject({ st: 0, sr: 1, ddd: 0, ao: 0, bm: 0 });
      expect(layer.ks).toBeDefined();
    }
    expect(JSON.stringify(lottie)).not.toMatch(/null|NaN|Infinity/);
  });

  // lottie-web rewrites the data it is given; a shared object would be rewritten twice.
  it('never uses one object in two places', () => {
    const lottie = bakeLottie([[square('#ff0000'), square('#00ff00')]], { ...OPTIONS, background: '#ffffff' });
    const seen = new Set<object>();
    const visit = (value: unknown) => {
      if (typeof value !== 'object' || value === null) return;
      expect(seen.has(value), 'an object appears twice').toBe(false);
      seen.add(value);
      Object.values(value).forEach(visit);
    };
    visit(lottie);
  });

  it('puts what zdog drew last first, as Lottie draws the first item on top', () => {
    const [layer] = shapeLayers(bakeLottie([[square('#0000ff'), square('#ff0000')]], OPTIONS).layers);
    const colors = layer.shapes.map((group) => (group.it[1] as FillItem).c.k.map((c) => Math.floor(c * 255)));
    expect(colors).toEqual([[255, 0, 0], [0, 0, 255]]);
  });

  it('gives each run of identical frames one layer, shown only for those frames', () => {
    const a = [square('#ff0000')];
    const b = [square('#00ff00')];
    const layers = shapeLayers(bakeLottie([a, a, b, a], OPTIONS).layers);
    expect(layers.map((layer) => [layer.ip, layer.op])).toEqual([[0, 2], [2, 3], [3, 4]]);
  });

  it('adds the background as a solid layer underneath, with its alpha as opacity', () => {
    const lottie = bakeLottie([[square('#ff0000')]], { ...OPTIONS, background: '#ffddbb80' });
    const background = lottie.layers[lottie.layers.length - 1] as SolidLayer;
    expect(background).toMatchObject({ ty: 1, sc: '#ffddbb', sw: 200, sh: 100, ip: 0, op: 1 });
    expect(background.ks.o.k).toBe(50.2);
    expect(bakeLottie([[square('#ff0000')]], OPTIONS).layers.every((layer) => layer.ty === 4)).toBe(true);
  });

  it('exports the starter scene as a still', () => {
    const view: ViewSpec = { rotate: { x: -0.3, y: 0.6, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 16, width: 512, height: 512 };
    const lottie = lottieStill(starterScene(), view, { background: true, name: 'scene' });
    expect(lottie.op).toBe(1);
    expect(shapeLayers(lottie.layers)[0].shapes.length).toBeGreaterThan(9);
    expect(lottie.layers[lottie.layers.length - 1]).toMatchObject({ ty: 1, sc: '#ffddbb' });
  });
});
