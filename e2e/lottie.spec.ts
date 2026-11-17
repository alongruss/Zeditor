import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { lottieAnimation, lottieStill } from '../src/export/lottie/exportScene';
import { setKey } from '../src/model/animation';
import { objectAtFrame, sceneAtFrame } from '../src/model/evaluate';
import { addShape, createCamera, createGroup, createShape, emptyScene } from '../src/model/scene';
import { SHAPE_TYPES, type CameraData, type Scene, type ShapeData } from '../src/model/types';
import { rootTranslate, viewFromCamera, type ViewSpec } from '../src/render/view';
import { ancestorsOf } from '../src/model/hierarchy';
import { parseSceneFile } from '../src/model/sceneFile';
import { zdogOptions, zdogTransform } from '../src/viewport/toZdog';
import { field, fileMenu, openEditorForEachTest, treeItem } from './helpers';

const ZDOG = 'node_modules/zdog/dist/zdog.dist.min.js';
const LOTTIE = 'node_modules/lottie-web/build/player/lottie.min.js';

/**
 * A scene with every shape type, overlapping so drawing order shows, and with
 * the cases that need care: color alpha, shape opacity, back colors, a dot,
 * thick strokes with sharp corners (caps and joins), a tilted cylinder and a
 * hemisphere.
 */
function fidelityScene(): Scene {
  let scene = emptyScene();
  const place = (shape: ShapeData) => {
    scene = addShape(scene, shape);
  };
  SHAPE_TYPES.forEach((type, i) => {
    const base = createShape(scene, type);
    const col = (i % 3) - 1;
    const row = Math.floor(i / 3) - 1;
    place({ ...base, translate: { x: col * 6.5, y: row * 6.5, z: (i % 2) * 2 - 1 }, rotate: { x: 20 * i, y: 35, z: 10 } });
  });
  // Sharp corners with a thick stroke: wrong caps or joins show up clearly.
  const polygon = scene.shapes.find((s) => s.type === 'Polygon')!;
  const thick = { ...polygon, props: { ...polygon.props, stroke: 1.5, radius: 3 } };
  // Alpha and opacity over other shapes.
  const box = scene.shapes.find((s) => s.type === 'Box')!;
  const faded = { ...box, opacity: 0.6, props: { ...box.props, color: '#3e63ddcc', topFace: '#e5484d' } };
  // A big translucent disc across the middle, in front of the others.
  const disc = {
    ...createShape(scene, 'Ellipse'),
    translate: { x: 1, y: 1, z: 6 },
    props: { diameter: 9, color: '#2f9e5a99', stroke: 0.5, fill: true },
  };
  scene = {
    ...scene,
    shapes: scene.shapes.map((s) => (s.id === thick.id ? thick : s.id === faded.id ? faded : s)),
  };
  return addShape(scene, disc);
}

interface Comparison {
  readonly ink: number;
  readonly mismatched: number;
}

/**
 * Draws one frame with zdog's own canvas renderer and with lottie-web, in a
 * blank page, and counts the pixels that differ noticeably.
 */
async function compare(page: Page, scene: Scene, view: ViewSpec): Promise<Comparison> {
  return compareFrame(page, scene, view, lottieStill(scene, view, { background: false, name: 'fidelity' }), 0);
}

/** Like `compare`, for frame `frame` of an already baked animation; `scene` is posed on that frame. */
async function compareFrame(page: Page, scene: Scene, view: ViewSpec, lottie: object, frame: number): Promise<Comparison> {
  const shapes = scene.shapes.map((shape) => ({ type: shape.type, options: zdogOptions(shape), parent: shape.parent }));
  // Groups, each after the group it's in, so the reference is built as zdog would nest it.
  const groups = [...scene.groups]
    .sort((a, b) => ancestorsOf(scene, a).length - ancestorsOf(scene, b).length)
    .map((group) => ({ id: group.id, parent: group.parent, drawTogether: group.drawTogether, options: zdogTransform(group) }));
  const translate = rootTranslate(view);

  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await page.addScriptTag({ path: ZDOG });
  await page.addScriptTag({ path: LOTTIE });
  return page.evaluate(
    async ({ lottie, shapes, groups, view, translate, frame }) => {
      const { width, height } = view;
      const w = window as unknown as {
        Zdog: Record<string, new (options: object) => { updateRenderGraph(): void }>;
        lottie: {
          loadAnimation(options: object): {
            isLoaded: boolean;
            addEventListener(name: string, listener: () => void): void;
            goToAndStop(frame: number, isFrame: boolean): void;
          };
        };
      };

      const reference = document.createElement('canvas');
      reference.width = width;
      reference.height = height;
      document.body.append(reference);
      const illo = new w.Zdog.Illustration({
        element: reference,
        zoom: view.pixelsPerUnit,
        rotate: view.rotate,
        translate,
        resize: false,
      });
      // Groups first (outermost first), then shapes, each added to its group.
      const nodes = new Map<string, object>();
      for (const group of groups) {
        const parent = (group.parent && nodes.get(group.parent)) || illo;
        nodes.set(group.id, new w.Zdog[group.drawTogether ? 'Group' : 'Anchor']({ ...group.options, addTo: parent }));
      }
      for (const shape of shapes) {
        new w.Zdog[shape.type]({ ...shape.options, addTo: (shape.parent && nodes.get(shape.parent)) || illo });
      }
      illo.updateRenderGraph();

      const box = document.createElement('div');
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      document.body.append(box);
      const animation = w.lottie.loadAnimation({
        container: box,
        renderer: 'canvas',
        loop: false,
        autoplay: false,
        animationData: structuredClone(lottie),
      });
      // With animationData given directly, lottie-web may finish loading before this line.
      if (!animation.isLoaded) await new Promise<void>((resolve) => animation.addEventListener('DOMLoaded', resolve));
      animation.goToAndStop(frame, true);
      const drawn = box.querySelector('canvas')!;

      const a = reference.getContext('2d')!.getImageData(0, 0, width, height).data;
      const b = drawn.getContext('2d')!.getImageData(0, 0, width, height).data;
      let ink = 0;
      let mismatched = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i + 3] === 0 && b[i + 3] === 0) continue;
        ink += 1;
        const diff = Math.max(
          Math.abs(a[i] - b[i]),
          Math.abs(a[i + 1] - b[i + 1]),
          Math.abs(a[i + 2] - b[i + 2]),
          Math.abs(a[i + 3] - b[i + 3]),
        );
        if (diff > 48) mismatched += 1;
      }
      return { ink, mismatched };
    },
    { lottie, shapes, groups, view, translate, frame },
  );
}

const view = (x: number, y: number): ViewSpec => ({
  rotate: { x, y, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  pixelsPerUnit: 20,
  width: 480,
  height: 400,
});

test.describe('Lottie export fidelity', () => {
  for (const [name, angles] of [
    ['front', [0, 0]],
    ['turned', [-0.35, 0.6]],
    ['from below and behind', [0.9, 2.6]],
  ] as const) {
    test(`a baked frame matches zdog's own drawing (${name})`, async ({ page }) => {
      const result = await compare(page, fidelityScene(), view(angles[0], angles[1]));
      expect(result.ink, 'something was drawn').toBeGreaterThan(20000);
      // Edges may anti-alias slightly differently; everything else must match.
      expect(result.mismatched / result.ink).toBeLessThan(0.01);
    });
  }
});

test.describe('Lottie export fidelity, zoomed in past the edges', () => {
  test('shapes out of view are left out; ones whose thick strokes reach in are kept, and it all matches zdog', async ({ page }) => {
    const scene = fidelityScene();
    const wide = view(-0.35, 0.6);
    // Three times closer, on a small picture: some shapes cross its edges, some are outside it.
    const close: ViewSpec = { ...wide, pixelsPerUnit: wide.pixelsPerUnit * 3, width: 320, height: 240 };
    const groups = (spec: ViewSpec) => (lottieStill(scene, spec, { background: false, name: 'edges' }).layers[0] as unknown as { shapes: unknown[] }).shapes.length;
    expect(groups(close)).toBeLessThan(groups(wide));
    for (const mode of ['baked', 'keys'] as const) {
      const lottie = lottieAnimation(scene, close, { background: false, name: 'edges', frames: [0], mode });
      const result = await compareFrame(page, scene, close, lottie, 0);
      expect(result.ink, `${mode}: something was drawn`).toBeGreaterThan(10000);
      expect(result.mismatched / result.ink, mode).toBeLessThan(0.01);
    }
  });
});

test.describe('Lottie export fidelity, with groups', () => {
  test('nested, turned and scaled groups, one drawing its shapes together', async ({ page }) => {
    let scene = fidelityScene();
    const outer = { ...createGroup(scene), translate: { x: 2, y: -1, z: 1 }, rotate: { x: 15, y: 30, z: -10 }, scale: 1.2 };
    const inner = {
      ...createGroup({ ...scene, groups: [outer] }),
      parent: outer.id,
      drawTogether: true,
      translate: { x: -3, y: 2, z: 0 },
      rotate: { x: 0, y: -45, z: 0 },
    };
    scene = {
      ...scene,
      groups: [outer, inner],
      // Half the shapes in the drawn-together group, the rest in the outer one.
      shapes: scene.shapes.map((shape, i) => ({ ...shape, parent: i % 2 === 0 ? inner.id : outer.id })),
    };
    for (const angles of [[0, 0], [-0.35, 0.6]] as const) {
      const result = await compare(page, scene, view(angles[0], angles[1]));
      expect(result.ink, 'something was drawn').toBeGreaterThan(15000);
      expect(result.mismatched / result.ink).toBeLessThan(0.01);
    }
  });
});

test.describe('Lottie export fidelity, a group drawn together', () => {
  test('draws its shapes in their own order, not by depth', async ({ page }) => {
    // The front disc comes first, so inside a Group the back one is drawn over it;
    // sorted by depth (an Anchor), the front one would be on top.
    let scene = emptyScene();
    const group = { ...createGroup(scene), drawTogether: true };
    scene = { ...scene, groups: [group] };
    const disc = (z: number, color: string, x: number): ShapeData => ({
      ...createShape(scene, 'Ellipse'),
      translate: { x, y: 0, z },
      parent: group.id,
      props: { diameter: 14, color, stroke: 1, fill: true },
    });
    scene = addShape(scene, disc(6, '#cc2255', -3));
    scene = addShape(scene, { ...disc(-6, '#3355cc', 3), id: 'ellipse-2' });
    const result = await compare(page, scene, view(0, 0));
    expect(result.ink).toBeGreaterThan(20000);
    expect(result.mismatched / result.ink).toBeLessThan(0.01);
  });
});

test.describe('Lottie export fidelity, through a camera', () => {
  test('a rolled camera looking at a point off the origin', async ({ page }) => {
    const rolled: ViewSpec = { ...view(-0.35, 0.6), rotate: { x: -0.35, y: 0.6, z: 0.4 }, target: { x: 3, y: -2, z: 1 } };
    const result = await compare(page, fidelityScene(), rolled);
    expect(result.ink, 'something was drawn').toBeGreaterThan(20000);
    expect(result.mismatched / result.ink).toBeLessThan(0.01);
  });

  test('an animated camera: each frame is filmed through the camera as posed on it', async ({ page }) => {
    const scene = fidelityScene();
    let camera: CameraData = createCamera(scene, {
      rotate: { x: -20, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      viewSpan: 26,
      width: 400,
      height: 300,
    });
    camera = setKey(setKey(camera, 'rotate.y', 0, -40), 'rotate.y', 29, 120);
    camera = setKey(setKey(camera, 'target.x', 0, -4), 'target.x', 29, 4);
    camera = setKey(setKey(camera, 'viewSpan', 0, 30), 'viewSpan', 29, 18);
    camera = setKey(setKey(camera, 'rotate.z', 0, 0), 'rotate.z', 29, 25);
    const frames = Array.from({ length: 30 }, (_, i) => i);
    const baked = lottieAnimation(scene, (frame) => viewFromCamera(objectAtFrame(camera, frame)), {
      background: false,
      name: 'camera',
      frames,
    });
    expect(baked).toMatchObject({ w: 400, h: 300 });

    for (const frame of [0, 11, 29]) {
      const posed = viewFromCamera(objectAtFrame(camera, frame));
      const result = await compareFrame(page, scene, posed, baked, frame);
      expect(result.ink, `frame ${frame} drew something`).toBeGreaterThan(10000);
      expect(result.mismatched / result.ink, `frame ${frame}`).toBeLessThan(0.01);
    }
  });
});

test.describe('Lottie export fidelity, animated', () => {
  test('sampled frames of a baked animation match zdog drawing the same frames', async ({ page }) => {
    let scene = fidelityScene();
    const animate = (id: string, path: string, keys: [number, number | string][]) => {
      scene = {
        ...scene,
        shapes: scene.shapes.map((s) =>
          s.id === id
            ? { ...s, tracks: { ...s.tracks, [path]: keys.map(([frame, value]) => ({ frame, value, easing: 'easeInOut' as const })) } }
            : s,
        ),
      };
    };
    const [first, second, third] = scene.shapes;
    animate(first.id, 'translate.x', [[0, -8], [29, 8]]);
    animate(second.id, 'rotate.y', [[0, 0], [29, 270]]);
    animate(third.id, 'props.color', [[0, '#ff0000'], [29, '#0000ff80']]);
    animate(third.id, 'translate.z', [[0, -6], [29, 6]]); // passes through other shapes: order changes
    const frames = Array.from({ length: 30 }, (_, i) => i);
    const baked = lottieAnimation(scene, view(-0.35, 0.6), { background: false, name: 'animated', frames });
    expect(baked.layers.length).toBeGreaterThan(10); // the frames differ, so they don't merge
    const keyed = lottieAnimation(scene, view(-0.35, 0.6), { background: false, name: 'animated', frames, mode: 'keys' });
    expect(JSON.stringify(keyed).length).toBeLessThan(JSON.stringify(baked).length * 0.7);

    for (const frame of [0, 9, 17, 29]) {
      for (const [mode, lottie] of [['baked', baked], ['keys', keyed]] as const) {
        const result = await compareFrame(page, sceneAtFrame(scene, frame), view(-0.35, 0.6), lottie, frame);
        expect(result.ink, `${mode}, frame ${frame} drew something`).toBeGreaterThan(20000);
        expect(result.mismatched / result.ink, `${mode}, frame ${frame}`).toBeLessThan(0.01);
      }
    }
  });
});

test.describe('Lottie export fidelity, the walking example', () => {
  test('one step through the Turntable camera matches zdog drawing the same frames, baked and with keys', async ({ page }) => {
    test.slow(); // the biggest scene here, exported twice
    const opened = parseSceneFile(await readFile('src/examples/nippu-walking.zeditor.json', 'utf8'));
    if (!opened.ok) throw new Error(opened.error);
    const scene = opened.scene;
    const camera = scene.cameras.find((c) => c.name === 'Turntable')!;
    const filmed = (frame: number) => ({ ...viewFromCamera(objectAtFrame(camera, frame)), width: 384, height: 384 });
    const frames = Array.from({ length: 30 }, (_, i) => i);
    const baked = lottieAnimation(scene, filmed, { background: false, name: 'walking', frames });
    const keyed = lottieAnimation(scene, filmed, { background: false, name: 'walking', frames, mode: 'keys' });
    // The camera turns and shapes pass in front of one another all the time: keys are never bigger.
    expect(JSON.stringify(keyed).length).toBeLessThanOrEqual(JSON.stringify(baked).length);
    // Off-key frames too: between keys, the bake must interpolate as the editor does.
    for (const [lottie, frame] of [[baked, 0], [baked, 10], [baked, 23], [keyed, 10], [keyed, 23]] as const) {
      const mode = lottie === baked ? 'baked' : 'keys';
      const result = await compareFrame(page, sceneAtFrame(scene, frame), filmed(frame), lottie, frame);
      expect(result.ink, `${mode}, frame ${frame} drew something`).toBeGreaterThan(15000);
      expect(result.mismatched / result.ink, `${mode}, frame ${frame}`).toBeLessThan(0.01);
    }
  });
});

test.describe('Lottie export with keys, between frames', () => {
  test('a slide plays smoothly between frames, and a jump still happens on its frame', async ({ page }) => {
    let scene = fidelityScene();
    const [first, second] = scene.shapes;
    const keys = (path: string, values: [number, number | string, 'linear' | 'hold'][]) => ({
      [path]: values.map(([frame, value, easing]) => ({ frame, value, easing })),
    });
    scene = {
      ...scene,
      shapes: scene.shapes.map((s) =>
        s.id === first.id
          ? { ...s, tracks: keys('translate.y', [[0, -6, 'linear'], [29, 6, 'linear']]) }
          : s.id === second.id
            ? { ...s, tracks: keys('props.color', [[0, '#ff0000', 'hold'], [10, '#0000ff', 'hold']]) }
            : s,
      ),
    };
    const frames = Array.from({ length: 30 }, (_, i) => i);
    const keyed = lottieAnimation(scene, view(0, 0), { background: false, name: 'between', frames, mode: 'keys' });
    // The slide is a straight line: two keys. The color jumps from frame 9 to 10: held keys there.
    const text = JSON.stringify(keyed);
    expect(text).toContain('"h":1');
    // Halfway between frames 4 and 5 the slide is halfway too. Between 9 and 10 the slide moves on,
    // but the color hasn't changed yet (as the editor poses it: a held key keeps its value till the next).
    const halfway = await compareFrame(page, sceneAtFrame(scene, 4.5), view(0, 0), keyed, 4.5);
    expect(halfway.mismatched / halfway.ink).toBeLessThan(0.01);
    const beforeJump = await compareFrame(page, sceneAtFrame(scene, 9.5), view(0, 0), keyed, 9.5);
    expect(beforeJump.mismatched / beforeJump.ink).toBeLessThan(0.01);
  });
});

test.describe('Export Lottie dialog', () => {
  openEditorForEachTest(test);

  test('exports the current view at the chosen size', async ({ page }) => {
    await fileMenu(page, 'Export Lottie…');
    const dialog = page.getByRole('dialog', { name: 'Export Lottie' });
    await expect(dialog).toBeVisible();

    // The size starts as the viewport's.
    const viewport = (await page.locator('svg.scene').boundingBox())!;
    await expect(dialog.getByLabel('Width')).toHaveValue(String(Math.round(viewport.width)));
    await expect(dialog.getByLabel('Height')).toHaveValue(String(Math.round(viewport.height)));
    await expect(dialog.getByText(/^About \d+ KB\.$/)).toBeVisible();

    // A bad size is refused before exporting.
    await dialog.getByLabel('Width').fill('0');
    await expect(dialog.getByRole('alert')).toContainText('whole numbers from 1');
    await expect(dialog.getByRole('button', { name: 'Export' })).toBeDisabled();

    await dialog.getByLabel('Width').fill('320');
    await dialog.getByLabel('Height').fill('240');
    await dialog.getByLabel('Background color (otherwise transparent)').uncheck();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('scene.lottie.json');
    const lottie = JSON.parse(await readFile(await file.path(), 'utf8'));
    // All 90 frames; nothing is animated, so they share one layer, and with keys (the default) nothing is keyed.
    expect(JSON.stringify(lottie)).not.toContain('"a":1');
    expect(lottie).toMatchObject({ w: 320, h: 240, ip: 0, op: 90, fr: 30 });
    expect(lottie.layers).toHaveLength(1);
    expect(lottie.layers[0]).toMatchObject({ ty: 4, st: 0, ip: 0, op: 90 });
    expect(lottie.layers[0].shapes.length).toBeGreaterThan(9);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Saved scene.lottie.json');
  });

  test('keys make a much smaller file than baking every frame, even as shapes pass behind others', async ({ page }) => {
    // The cone slides across and back, behind the other shapes: it keeps its own place in the layer.
    await treeItem(page, 'Cone 1').click();
    await page.getByRole('button', { name: /^Animate Position at frame 0/ }).click();
    await page.getByLabel('Frame', { exact: true }).fill('60');
    await page.getByLabel('Frame', { exact: true }).press('Enter');
    await field(page, 'Position X').fill('-20');
    await field(page, 'Position X').press('Tab');
    await field(page, 'Position Z').fill('-40');
    await field(page, 'Position Z').press('Tab');

    await fileMenu(page, 'Export Lottie…');
    const dialog = page.getByRole('dialog', { name: 'Export Lottie' });
    const keys = dialog.getByRole('radio', { name: /^Keys/ });
    await expect(keys).toBeChecked();
    const note = dialog.getByText(/^About /);
    // Just the size: no new layers, and keys are smaller than baking.
    await expect(note).toHaveText(/^About [\d.]+ (bytes|KB|MB)\.$/);
    const size = async () => {
      const text = (await note.textContent())!;
      const [, n, unit] = /About ([\d.]+) (bytes|KB|MB)/.exec(text)!;
      return Number(n) * { bytes: 1, KB: 1024, MB: 1024 * 1024 }[unit as 'bytes' | 'KB' | 'MB'];
    };
    const keyedSize = await size();
    await dialog.getByRole('radio', { name: /^Baked/ }).check();
    await expect.poll(size).toBeGreaterThan(keyedSize * 2);

    await keys.check();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const lottie = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(JSON.stringify(lottie)).toContain('"a":1');
  });

  test('films through a camera at its own picture size; looking through it picks it', async ({ page }) => {
    await page.getByRole('button', { name: 'Add ▾' }).click();
    await page.getByRole('menuitem', { name: 'Camera' }).click();
    for (const [label, value] of [['Width', '320'], ['Height', '200']]) {
      await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByLabel(label, { exact: true }).press('Tab');
    }
    await page.getByRole('button', { name: 'Look through' }).click();

    await fileMenu(page, 'Export Lottie…');
    const dialog = page.getByRole('dialog', { name: 'Export Lottie' });
    await expect(dialog.getByLabel('View')).toHaveValue('camera-1');
    await expect(dialog.getByLabel('Width')).toHaveValue('320');
    await expect(dialog.getByLabel('Width')).toBeDisabled();
    await expect(dialog.getByLabel('Height')).toHaveValue('200');
    await expect(dialog.getByText(/^About \d+ KB\.$/)).toBeVisible();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const lottie = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(lottie).toMatchObject({ w: 320, h: 200 });

    // The free view can still be chosen, at a size of its own.
    await fileMenu(page, 'Export Lottie…');
    await dialog.getByLabel('View').selectOption({ label: 'Free view' });
    await expect(dialog.getByLabel('Width')).toBeEnabled();
    await expect(dialog.getByLabel('Width')).not.toHaveValue('320');
  });

  test('Esc or Cancel closes it without exporting', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Export Lottie' });
    // Wait for the dialog each time: an Esc pressed before it opens closes nothing,
    // and "hidden" would then pass before the dialog appears (as on slower CI machines).
    await fileMenu(page, 'Export Lottie…');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'File ▾' })).toBeEnabled();

    await fileMenu(page, 'Export Lottie…');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    // Nothing was downloaded or reported.
    await expect(page.getByRole('status')).toBeEmpty();
  });
});
