import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { lottieAnimation, lottieStill } from '../src/export/lottie/exportScene';
import { setKey } from '../src/model/animation';
import { objectAtFrame, sceneAtFrame } from '../src/model/evaluate';
import { addShape, createCamera, createShape, emptyScene } from '../src/model/scene';
import { SHAPE_TYPES, type CameraData, type Scene, type ShapeData } from '../src/model/types';
import { rootTranslate, viewFromCamera, type ViewSpec } from '../src/render/view';
import { zdogOptions } from '../src/viewport/toZdog';
import { fileMenu, openEditorForEachTest } from './helpers';

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
  const shapes = scene.shapes.map((shape) => ({ type: shape.type, options: zdogOptions(shape) }));
  const translate = rootTranslate(view);

  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await page.addScriptTag({ path: ZDOG });
  await page.addScriptTag({ path: LOTTIE });
  return page.evaluate(
    async ({ lottie, shapes, view, translate, frame }) => {
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
      for (const shape of shapes) new w.Zdog[shape.type]({ ...shape.options, addTo: illo });
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
    { lottie, shapes, view, translate, frame },
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

    for (const frame of [0, 9, 17, 29]) {
      const result = await compareFrame(page, sceneAtFrame(scene, frame), view(-0.35, 0.6), baked, frame);
      expect(result.ink, `frame ${frame} drew something`).toBeGreaterThan(20000);
      expect(result.mismatched / result.ink, `frame ${frame}`).toBeLessThan(0.01);
    }
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
    // All 90 frames; nothing is animated, so they share one layer.
    expect(lottie).toMatchObject({ w: 320, h: 240, ip: 0, op: 90, fr: 30 });
    expect(lottie.layers).toHaveLength(1);
    expect(lottie.layers[0]).toMatchObject({ ty: 4, st: 0, ip: 0, op: 90 });
    expect(lottie.layers[0].shapes.length).toBeGreaterThan(9);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Saved scene.lottie.json');
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
