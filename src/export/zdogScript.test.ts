import * as Zdog from 'zdog';
import { describe, expect, it } from 'vitest';
import { worldTransform } from '../model/hierarchy';
import { setKey } from '../model/animation';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { addShape, createCamera, createGroup, createShape, emptyScene, updateShape } from '../model/scene';
import { applyTransform } from '../model/transform';
import { starterScene } from '../model/starterScene';
import type { Keyframe, Scene, ShapeData } from '../model/types';
import { turn } from '../render/view';
import { DEFAULT_FREE_VIEW, type FreeView } from '../viewport/freeView';
import { createZdogShape, zdogOptions } from '../viewport/toZdog';
import {
  EXPORT_CANVAS_SIZE,
  constName,
  exportZdogScript,
  scriptViewFromCamera,
  scriptViewFromFreeView,
} from './zdogScript';

const FREE = scriptViewFromFreeView(DEFAULT_FREE_VIEW);

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
    const ran = run(exportZdogScript(scene, FREE));
    const children = childrenOf(ran.illo);
    expect(children).toHaveLength(scene.shapes.length);
    scene.shapes.forEach((shape, i) => expectSameShape(children[i], shape));
    expect(ran.frames).toBe(1); // the draw loop started
  });

  it('keeps 0 and false values, and fades colors by opacity', () => {
    const scene = updateShape(starterScene(), 'cone-1', { opacity: 0.5, props: { stroke: 0, fill: false } });
    const script = exportZdogScript(scene, FREE);
    const block = /const cone1 = new Zdog\.Cone\(\{([\s\S]*?)\n\}\);/.exec(script)?.[1] ?? '';
    expect(block).toContain('stroke: 0,');
    expect(block).toContain('fill: false,');
    const cone = childrenOf(run(script).illo)[7] as unknown as { color: string; stroke: number; fill: boolean };
    expect(cone).toMatchObject({ color: '#66336680', stroke: 0, fill: false });
  });

  it('starts from the current camera and the scene background', () => {
    const camera: FreeView = { rotate: { x: -0.25, y: 0.5 }, zoom: 2 };
    const ran = run(exportZdogScript(starterScene(), scriptViewFromFreeView(camera)));
    const rotate = ran.illo.rotate as Zdog.Vector;
    expect(rotate.x).toBeCloseTo(-0.25, 3);
    expect(rotate.y).toBeCloseTo(0.5, 3);
    // Zoom 2 fits half as many world units across the canvas.
    expect(ran.illo.options.zoom).toBeCloseTo(EXPORT_CANVAS_SIZE / 16);
    expect(ran.illo.options.dragRotate).toBe(true);
    expect(ran.element).toMatchObject({ width: EXPORT_CANVAS_SIZE, height: EXPORT_CANVAS_SIZE });
    expect(ran.element.style.background).toBe('#ffddbb');
  });

  it('looks through a camera: its roll, target, view span and picture size', () => {
    const scene = starterScene();
    const camera = {
      ...createCamera(scene, {
        rotate: { x: -20, y: 35, z: 15 },
        target: { x: 3, y: -2, z: 1.5 },
        viewSpan: 24,
        width: 640,
        height: 360,
      }),
    };
    const view = scriptViewFromCamera(camera);
    const ran = run(exportZdogScript(scene, view));
    expect(ran.element).toMatchObject({ width: 640, height: 360 });
    expect(ran.illo.options.zoom).toBeCloseTo(360 / 24);
    // Every shape lands where the editor puts it: turned around the target.
    ran.illo.updateGraph();
    const world = childrenOf(ran.illo)[0];
    const shapes = childrenOf(world);
    expect(shapes).toHaveLength(scene.shapes.length);
    scene.shapes.forEach((shape, i) => {
      const p = shape.translate;
      const expected = turn({ x: p.x - 3, y: p.y + 2, z: p.z - 1.5 }, view.rotate);
      const actual = (shapes[i] as unknown as { renderOrigin: Zdog.Vector }).renderOrigin;
      for (const axis of ['x', 'y', 'z'] as const) expect(actual[axis], `${shape.id} ${axis}`).toBeCloseTo(expected[axis], 3);
    });
  });

  it('exports an empty scene', () => {
    expect(childrenOf(run(exportZdogScript(emptyScene(), FREE)).illo)).toHaveLength(0);
  });

  it('never breaks out of a comment or string, whatever a shape is called', () => {
    for (const lineBreak of [10, 13, 0x2028, 0x2029].map((code) => String.fromCharCode(code))) {
      const shape = { ...createShape(emptyScene(), 'Box'), name: `Evil${lineBreak}});throw 1;//` };
      const script = exportZdogScript(addShape(emptyScene(), shape), FREE);
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
    expect(named('player', 'Parse int', 'animated')).toEqual(['playerShape', 'parseIntShape', 'animatedShape']);
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

describe('exportZdogScript with groups', () => {
  it('nests shapes in Anchors and Groups, and zdog puts them where the editor does', () => {
    let scene: Scene = emptyScene();
    const outer = { ...createGroup(scene), translate: { x: 4, y: -2, z: 1 }, rotate: { x: 20, y: -30, z: 10 }, scale: 1.5 };
    const inner = { ...createGroup({ ...scene, groups: [outer] }), parent: outer.id, drawTogether: true, translate: { x: 0, y: 3, z: 0 } };
    scene = { ...scene, groups: [outer, inner] };
    const box: ShapeData = { ...createShape(scene, 'Box'), translate: { x: 1, y: 1, z: -2 }, parent: inner.id };
    scene = addShape(scene, box);

    const ran = run(exportZdogScript(scene, FREE));
    const outerNode = childrenOf(ran.illo)[0];
    expect(outerNode).toBeInstanceOf(Zdog.Anchor);
    const innerNode = childrenOf(outerNode)[0];
    expect(innerNode).toBeInstanceOf(Zdog.Group);
    const boxNode = childrenOf(innerNode)[0] as unknown as { renderOrigin: Zdog.Vector };

    ran.illo.updateGraph();
    const expected = applyTransform(worldTransform(scene, box), { x: 0, y: 0, z: 0 });
    // The free view's rotation is the identity, so the render origin is the world position.
    for (const axis of ['x', 'y', 'z'] as const) expect(boxNode.renderOrigin[axis]).toBeCloseTo(expected[axis], 4);
  });
});

/**
 * Runs an animated script, as `run` does, and hands back its player and its
 * list of animated objects. `tick(ms)` runs one animation frame at that time.
 */
function runAnimated(script: string) {
  let next: ((now: number) => void) | null = null;
  const element = { width: 0, height: 0, className: '', style: {} as Record<string, string> };
  class Illustration extends Zdog.Anchor {
    options: Record<string, unknown>;
    zoom: number;
    constructor(options: Record<string, unknown>) {
      super(options as Zdog.AnchorOptions);
      this.options = options;
      this.zoom = options.zoom as number;
    }
    updateRenderGraph() {}
  }
  const page = { querySelector: () => null, createElement: () => element, body: { append: () => {} } };
  const library = (Zdog as unknown as { default?: typeof Zdog }).default ?? Zdog;
  const made = new Function('Zdog', 'document', 'requestAnimationFrame', `${script}\nreturn { animated, player, illo };`)(
    { ...library, Illustration },
    page,
    (callback: (now: number) => void) => {
      next = callback;
    },
  ) as {
    animated: { node: Zdog.Anchor }[];
    player: { frame: number; time: number; playing: boolean; play(): void; pause(): void; goTo(n: number): void };
    illo: Illustration;
  };
  const tick = (now: number) => {
    const callback = next;
    next = null;
    callback?.(now);
  };
  return { ...made, tick };
}

describe('exportZdogScript with animation', () => {
  /** A scene with keys of every kind: moves, turns, colors, opacity, whole numbers, a group and easings. */
  function animatedScene(): Scene {
    let scene = starterScene();
    const group = { ...createGroup(scene), translate: { x: 1, y: 0, z: 0 } };
    scene = { ...scene, groups: [setKey(setKey(group, 'rotate.z', 0, 0), 'rotate.z', 40, 90)] };
    const polygon: ShapeData = { ...createShape(scene, 'Polygon'), parent: group.id };
    scene = addShape(scene, polygon);
    const edit = (id: string, change: (shape: ShapeData) => ShapeData) => {
      scene = { ...scene, shapes: scene.shapes.map((shape) => (shape.id === id ? change(shape) : shape)) };
    };
    edit('cone-1', (s) => setKey(setKey(s, 'translate.x', 0, -4), 'translate.x', 60, 20));
    edit('cone-1', (s) => setKey(setKey(s, 'rotate.y', 10, 0), 'rotate.y', 50, 180));
    edit('box-1', (s) => setKey(setKey(s, 'props.color', 0, '#ff0000'), 'props.color', 30, '#0000ff'));
    edit('box-1', (s) => setKey(setKey(s, 'opacity', 20, 1), 'opacity', 80, 0.25));
    edit('box-1', (s) => setKey(setKey(s, 'scale', 0, 1), 'scale', 89, 2));
    edit(polygon.id, (s) => setKey(setKey(s, 'props.sides', 0, 3), 'props.sides', 60, 9));
    // The cone is in the middle of the illustration's children: rebuilding it must keep it there.
    edit('cone-1', (s) => setKey(setKey(s, 'props.color', 5, '#336699'), 'props.color', 70, '#ffcc00'));
    // Every easing, on smooth tracks as well as a whole-number one.
    const easings = { 'translate.x': 'easeIn', 'rotate.y': 'easeOut', 'props.color': 'linear', opacity: 'hold', 'props.sides': 'easeIn' } as const;
    scene = {
      ...scene,
      shapes: scene.shapes.map((shape) => {
        if (!shape.tracks) return shape;
        const tracks = Object.fromEntries(
          Object.entries(shape.tracks).map(([path, keys]) => {
            const easing = easings[path as keyof typeof easings];
            return [path, easing ? keys.map((key) => ({ ...key, easing })) : keys];
          }),
        );
        return { ...shape, tracks };
      }),
    };
    return scene;
  }

  it('plays the keys as the editor does, frame by frame, keeping each shape in its place', () => {
    const scene = animatedScene();
    const ran = runAnimated(exportZdogScript(scene, FREE));
    const { fps } = scene.settings;
    const animatedShapes = scene.shapes.filter((shape) => shape.tracks);
    expect(ran.animated).toHaveLength(animatedShapes.length + 1); // and the group
    ran.tick(5000); // the clock starts on frame 0
    for (const frame of [0, 1, 7, 15, 25, 31, 44, 59, 60, 79, 88, 89]) {
      ran.tick(5000 + (frame * 1000) / fps + 1);
      expect(ran.player.frame).toBe(frame);
      const posed = sceneAtFrame(scene, ran.player.time);
      const group = ran.animated[0].node;
      expect((group.rotate as Zdog.Vector).z, `group on ${frame}`).toBeCloseTo((posed.groups[0].rotate.z * Math.PI) / 180, 9);
      animatedShapes.forEach((shape, i) => {
        const node = ran.animated[i + 1].node;
        expectSameShape(node, posed.shapes.find((s) => s.id === shape.id)!);
        // A rebuilt shape stays where it was among its parent's children, so the drawing order holds.
        const parent = (node as unknown as { addTo: Zdog.Anchor }).addTo;
        const siblings = [...scene.groups, ...scene.shapes].filter((s) => s.parent === shape.parent);
        expect(childrenOf(parent).indexOf(node), `${shape.id} on ${frame}`).toBe(siblings.findIndex((s) => s.id === shape.id));
      });
    }
    // Nothing left behind: the illustration holds the group and the other shapes, the group the polygon.
    expect(childrenOf(ran.illo)).toHaveLength(scene.shapes.length);
    expect(childrenOf(ran.animated[0].node)).toHaveLength(1);
  });

  it('plays custom curves as the editor does, overshoots included, within each setting limits', () => {
    const back = [0.3, -0.8, 0.7, 1.8] as const;
    let scene = starterScene();
    const curved = (shape: ShapeData, path: string, from: Keyframe['value'], to: Keyframe['value']) => ({
      ...shape,
      tracks: { ...shape.tracks, [path]: [{ frame: 0, value: from, easing: back }, { frame: 40, value: to, easing: 'linear' as const }] },
    });
    scene = {
      ...scene,
      shapes: scene.shapes.map((shape) =>
        shape.id === 'cone-1'
          ? curved(curved(shape, 'translate.x', -5, 5), 'scale', 0.1, 2) // dips below 0: stops at 0
          : shape.id === 'box-1'
            ? curved(curved(shape, 'opacity', 0.05, 0.95), 'props.color', '#000000', '#808080')
            : shape,
      ),
    };
    const script = exportZdogScript(scene, FREE);
    expect(script).toContain('limits: { opacity: { min: 0, max: 1 } }');
    expect(script).toContain('limits: { scale: { min: 0 } }');
    expect(script).toContain('[0.3, -0.8, 0.7, 1.8]');
    const ran = runAnimated(script);
    const shapes = scene.shapes.filter((shape) => shape.tracks);
    ran.tick(0);
    for (const frame of [3, 8, 20, 33, 38, 40]) {
      ran.tick((frame * 1000) / scene.settings.fps + 1);
      const posed = sceneAtFrame(scene, ran.player.time);
      shapes.forEach((shape, i) => expectSameShape(ran.animated[i].node, posed.shapes.find((s) => s.id === shape.id)!));
    }
  });

  it('plays the moments between frames, and pauses on a whole frame', () => {
    const scene = animatedScene();
    const ran = runAnimated(exportZdogScript(scene, FREE));
    const ms = 1000 / scene.settings.fps;
    const coneX = () => (ran.animated[1].node.translate as Zdog.Vector).x;
    const editorX = (moment: number) => sceneAtFrame(scene, moment).shapes.find((s) => s.id === 'cone-1')!.translate.x;
    ran.tick(0);
    ran.tick(20.5 * ms);
    expect(ran.player.time).toBeCloseTo(20.5, 9);
    expect(ran.player.frame).toBe(20);
    expect(coneX()).toBeCloseTo(editorX(20.5), 9);
    expect(Math.abs(coneX() - editorX(20))).toBeGreaterThan(0.01); // not held on frame 20
    ran.player.pause();
    ran.tick(30 * ms);
    expect(ran.player.time).toBe(20);
    expect(coneX()).toBeCloseTo(editorX(20), 9);
  });

  it('loops, and can be paused, played and sent to a frame', () => {
    const scene = animatedScene();
    const ran = runAnimated(exportZdogScript(scene, FREE));
    const ms = 1000 / scene.settings.fps;
    const coneX = () => (ran.animated[1].node.translate as Zdog.Vector).x;
    ran.tick(0);
    ran.tick(scene.settings.duration * ms + 5 * ms + 1);
    expect(ran.player.frame).toBe(5);
    ran.player.pause();
    ran.tick(500 * ms);
    expect(ran.player.frame).toBe(5);
    ran.player.goTo(60);
    ran.tick(501 * ms);
    expect(ran.player.frame).toBe(60);
    expect(coneX()).toBeCloseTo(20);
    ran.player.play();
    ran.tick(600 * ms);
    ran.tick(610 * ms + 1);
    expect(ran.player.frame).toBe(70);
  });

  it('moves with the camera it looks through: its angle, target and view span', () => {
    let camera = createCamera(starterScene(), {
      rotate: { x: -10, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      viewSpan: 20,
      width: 400,
      height: 300,
    });
    camera = setKey(setKey(camera, 'rotate.y', 0, 0), 'rotate.y', 89, 360);
    camera = setKey(setKey(camera, 'target.x', 0, 0), 'target.x', 45, 6);
    camera = setKey(setKey(camera, 'viewSpan', 0, 20), 'viewSpan', 45, 40);
    const scene = { ...starterScene(), cameras: [camera] };
    const script = exportZdogScript(scene, scriptViewFromCamera(camera, 30), 30);
    expect(script).not.toContain('dragRotate'); // the camera turns, so dragging would fight it
    const ran = runAnimated(script);
    ran.tick(0);
    const frame = 30;
    ran.tick((frame * 1000) / scene.settings.fps + 1);
    const posed = objectAtFrame(camera, ran.player.time);
    expect((ran.illo.rotate as Zdog.Vector).y).toBeCloseTo((posed.rotate.y * Math.PI) / 180, 9);
    expect((ran.illo.rotate as Zdog.Vector).x).toBeCloseTo((-10 * Math.PI) / 180, 9);
    expect(ran.illo.zoom).toBeCloseTo(300 / posed.viewSpan, 9);
    const world = childrenOf(ran.illo)[0];
    expect((world.translate as Zdog.Vector).x).toBeCloseTo(-posed.target.x, 9);
  });

  it('draws a still scene as before, on the frame asked for, with no player', () => {
    let scene = starterScene();
    // Keys only on a camera it doesn't look through: still.
    const camera = setKey(
      createCamera(scene, { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: 20, width: 100, height: 100 }),
      'viewSpan',
      3,
      10,
    );
    scene = { ...scene, cameras: [camera] };
    const script = exportZdogScript(scene, FREE, 12);
    expect(script).not.toContain('player');
    expect(script).toContain('dragRotate: true');
    expect(script).toBe(exportZdogScript(starterScene(), FREE));
  });
});
