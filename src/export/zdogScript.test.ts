import * as Zdog from 'zdog';
import { describe, expect, it } from 'vitest';
import { addShape, createShape, emptyScene, updateShape } from '../model/scene';
import { starterScene } from '../model/starterScene';
import type { Scene, ShapeData } from '../model/types';
import { DEFAULT_CAMERA, type Camera } from '../viewport/camera';
import { createZdogShape, zdogOptions } from '../viewport/toZdog';
import { EXPORT_CANVAS_SIZE, constName, exportZdogScript } from './zdogScript';

type FakeIllustration = Zdog.Anchor & { options: Record<string, unknown> };

interface Ran {
  readonly illo: FakeIllustration;
  readonly element: { width: number; height: number; className: string; style: Record<string, string> };
  readonly frames: number;
}

/**
 * Runs an exported script against the real zdog, with just enough of a page
 * around it: no canvas exists yet, and the Illustration is an Anchor (zdog's
 * Illustration needs a real canvas or SVG to draw on).
 */
function run(script: string): Ran {
  const element = { width: 0, height: 0, className: '', style: {} as Record<string, string> };
  const made: { illo?: FakeIllustration; frames: number } = { frames: 0 };
  class Illustration extends Zdog.Anchor {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      super(options as Zdog.AnchorOptions);
      this.options = options;
      made.illo = this as unknown as FakeIllustration;
    }
    updateRenderGraph() {
      made.frames += 1;
    }
  }
  const page = {
    querySelector: () => null,
    createElement: () => element,
    body: { append: () => {} },
  };
  // zdog is CommonJS; take its exports whichever way the bundler wrapped them.
  const library = (Zdog as unknown as { default?: typeof Zdog }).default ?? Zdog;
  const api = { ...library, Illustration };
  new Function('Zdog', 'document', 'requestAnimationFrame', script)(api, page, () => {});
  if (!made.illo) throw new Error('the script made no Illustration');
  return { illo: made.illo, element, frames: made.frames };
}

const childrenOf = (anchor: Zdog.Anchor) => (anchor as unknown as { children: Zdog.Anchor[] }).children;

/** Asserts that `actual` (built by the script) matches what the editor itself draws for `shape`. */
function expectSameShape(actual: Zdog.Anchor, shape: ShapeData) {
  const expected = createZdogShape(shape);
  expect(actual.constructor).toBe(expected.constructor);
  for (const key of Object.keys(zdogOptions(shape))) {
    const a = (actual as unknown as Record<string, unknown>)[key];
    const e = (expected as unknown as Record<string, unknown>)[key];
    if (key === 'rotate') {
      const [ra, re] = [a as Zdog.Vector, e as Zdog.Vector];
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(ra[axis], `${shape.id} rotate.${axis}`).toBeCloseTo(re[axis], 9);
      }
    } else {
      expect(a, `${shape.id} ${key}`).toEqual(e);
    }
  }
}

describe('exportZdogScript', () => {
  it('runs against zdog and gives back the same shapes', () => {
    let scene: Scene = starterScene();
    scene = updateShape(scene, 'box-1', { rotate: { x: 30, y: -45, z: 12.5 }, scale: 1.5, opacity: 0.5 });
    scene = updateShape(scene, 'cone-1', { props: { stroke: 0, fill: false } });
    const ran = run(exportZdogScript(scene, DEFAULT_CAMERA));
    const children = childrenOf(ran.illo);
    expect(children).toHaveLength(scene.shapes.length);
    scene.shapes.forEach((shape, i) => expectSameShape(children[i], shape));
    expect(ran.frames).toBe(1); // the draw loop started
  });

  it('keeps 0 and false values, and fades colors by opacity', () => {
    const scene = updateShape(starterScene(), 'cone-1', { opacity: 0.5, props: { stroke: 0, fill: false } });
    const script = exportZdogScript(scene, DEFAULT_CAMERA);
    const block = /const cone1 = new Zdog\.Cone\(\{([\s\S]*?)\n\}\);/.exec(script)?.[1] ?? '';
    expect(block).toContain('stroke: 0,');
    expect(block).toContain('fill: false,');
    const cone = childrenOf(run(script).illo)[7] as unknown as { color: string; stroke: number; fill: boolean };
    expect(cone).toMatchObject({ color: '#66336680', stroke: 0, fill: false });
  });

  it('starts from the current camera and the scene background', () => {
    const camera: Camera = { rotate: { x: -0.25, y: 0.5 }, zoom: 2 };
    const ran = run(exportZdogScript(starterScene(), camera));
    const rotate = ran.illo.rotate as Zdog.Vector;
    expect(rotate.x).toBeCloseTo(-0.25, 3);
    expect(rotate.y).toBeCloseTo(0.5, 3);
    // Zoom 2 fits half as many world units across the canvas.
    expect(ran.illo.options.zoom).toBeCloseTo(EXPORT_CANVAS_SIZE / 16);
    expect(ran.illo.options.dragRotate).toBe(true);
    expect(ran.element).toMatchObject({ width: EXPORT_CANVAS_SIZE, height: EXPORT_CANVAS_SIZE });
    expect(ran.element.style.background).toBe('#ffddbb');
  });

  it('exports an empty scene', () => {
    expect(childrenOf(run(exportZdogScript(emptyScene(), DEFAULT_CAMERA)).illo)).toHaveLength(0);
  });

  it('never breaks out of a comment or string, whatever a shape is called', () => {
    for (const lineBreak of [10, 13, 0x2028, 0x2029].map((code) => String.fromCharCode(code))) {
      const shape = { ...createShape(emptyScene(), 'Box'), name: `Evil${lineBreak}});throw 1;//` };
      const script = exportZdogScript(addShape(emptyScene(), shape), DEFAULT_CAMERA);
      expect(script).not.toContain(lineBreak === '\n' ? '\n});throw' : lineBreak);
      expect(childrenOf(run(script).illo)).toHaveLength(1);
    }
  });
});

describe('constName', () => {
  const named = (...names: string[]) => {
    const used = new Set<string>();
    return names.map((name) => constName({ ...createShape(emptyScene(), 'Box'), name }, used));
  };

  it('turns shape names into camelCase names', () => {
    expect(named('Rounded rectangle 1', 'Box 1', 'big-red ball')).toEqual(['roundedRectangle1', 'box1', 'bigRedBall']);
  });

  it('keeps letters from any language', () => {
    expect(named('קופסה גדולה')).toEqual([
      'קופסהגדולה',
    ]);
  });

  it('avoids clashes, reserved words, the script own names and leading digits', () => {
    expect(named('Box', 'box', 'new', 'illo', '3D thing', '!!!')).toEqual([
      'box',
      'box2',
      'newShape',
      'illoShape',
      'shape3DThing',
      'box1',
    ]);
  });
});
