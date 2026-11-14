import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { lottieStill } from '../src/export/lottie/exportScene';
import { addShape, createShape, emptyScene } from '../src/model/scene';
import { SHAPE_TYPES, type Scene, type ShapeData } from '../src/model/types';
import type { ViewSpec } from '../src/render/view';
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
  const lottie = lottieStill(scene, view, { background: false, name: 'fidelity' });
  const shapes = scene.shapes.map((shape) => ({ type: shape.type, options: zdogOptions(shape) }));

  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await page.addScriptTag({ path: ZDOG });
  await page.addScriptTag({ path: LOTTIE });
  return page.evaluate(
    async ({ lottie, shapes, view }) => {
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
      const illo = new w.Zdog.Illustration({ element: reference, zoom: view.pixelsPerUnit, rotate: view.rotate, resize: false });
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
      animation.goToAndStop(0, true);
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
    { lottie, shapes, view },
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
    expect(lottie).toMatchObject({ w: 320, h: 240, ip: 0, op: 1 });
    expect(lottie.layers.every((layer: { ty: number; st: number }) => layer.ty === 4 && layer.st === 0)).toBe(true);
    expect(lottie.layers[0].shapes.length).toBeGreaterThan(9);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Saved scene.lottie.json');
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
