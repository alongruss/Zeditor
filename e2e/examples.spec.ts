import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { lottieStill } from '../src/export/lottie/exportScene';
import { parseSceneFile } from '../src/model/sceneFile';
import type { Scene } from '../src/model/types';
import type { ViewSpec } from '../src/render/view';
import { afterRedraw, fileMenu, openEditorForEachTest } from './helpers';

const ZDOG = 'node_modules/zdog/dist/zdog.dist.min.js';
const LOTTIE = 'node_modules/lottie-web/build/player/lottie.min.js';
const DEMO = 'examples-src/nippu.js';

function nippu(): Scene {
  const result = parseSceneFile(readFileSync('src/examples/nippu.zeditor.json', 'utf8'));
  if (!result.ok) throw new Error(result.error);
  return result.scene;
}

const view = (x: number, y: number): ViewSpec => ({
  rotate: { x, y, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  pixelsPerUnit: 3,
  width: 420,
  height: 420,
});

/**
 * Runs the original demo script (unchanged) with zdog's canvas renderer, and
 * draws the editor's Lottie export of the imported scene with lottie-web,
 * both from the same angle; counts the pixels that differ noticeably.
 */
async function compareWithDemo(page: Page, spec: ViewSpec): Promise<{ ink: number; mismatched: number }> {
  const lottie = lottieStill(nippu(), spec, { background: false, name: 'nippu' });
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><canvas class="illo"></canvas><button class="reset-button"></button></body></html>',
  );
  // The demo animates forever; one frame is enough here.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.addScriptTag({ path: ZDOG });
  await page.addScriptTag({ path: DEMO });
  await page.addScriptTag({ path: LOTTIE });
  return page.evaluate(
    async ({ lottie, spec }) => {
      const w = window as unknown as {
        illo: {
          zoom: number;
          rotate: { set(v: object): void };
          translate: { set(v: object): void };
          setSize(width: number, height: number): void;
          updateRenderGraph(): void;
          element: HTMLCanvasElement;
        };
        lottie: {
          loadAnimation(options: object): {
            isLoaded: boolean;
            addEventListener(name: string, listener: () => void): void;
            goToAndStop(frame: number, isFrame: boolean): void;
          };
        };
      };
      const { illo } = w;
      illo.zoom = spec.pixelsPerUnit;
      illo.setSize(spec.width, spec.height);
      illo.rotate.set(spec.rotate);
      illo.translate.set({ x: 0, y: 0, z: 0 });
      illo.updateRenderGraph();

      const box = document.createElement('div');
      box.style.width = `${spec.width}px`;
      box.style.height = `${spec.height}px`;
      document.body.append(box);
      const animation = w.lottie.loadAnimation({
        container: box,
        renderer: 'canvas',
        loop: false,
        autoplay: false,
        animationData: structuredClone(lottie),
      });
      if (!animation.isLoaded) await new Promise<void>((resolve) => animation.addEventListener('DOMLoaded', resolve));
      animation.goToAndStop(0, true);
      const drawn = box.querySelector('canvas')!;

      const a = illo.element.getContext('2d')!.getImageData(0, 0, spec.width, spec.height).data;
      const b = drawn.getContext('2d')!.getImageData(0, 0, spec.width, spec.height).data;
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
    { lottie, spec },
  );
}

test.describe('the Nippu example matches the original demo', () => {
  for (const [name, angles] of [
    ['as the demo starts', [0, -Math.PI / 4]],
    ['from the front', [0, 0]],
    ['from above and behind', [-0.5, 2.4]],
  ] as const) {
    test(`drawn ${name}`, async ({ page }) => {
      const result = await compareWithDemo(page, view(angles[0], angles[1]));
      expect(result.ink, 'something was drawn').toBeGreaterThan(15000);
      expect(result.mismatched / result.ink).toBeLessThan(0.01);
    });
  }
});

test.describe('File ▾ › Example: Nippu', () => {
  openEditorForEachTest(test);

  test('opens the couple from the demo’s angle, credits it, and undoes', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept());
    await fileMenu(page, 'Example: Nippu');
    await expect(page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: /^Ground/ })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Robin Davey');
    // A big scene starts with its top two levels open: Ground › Dude › (Hips ▸, Torso ▸).
    await expect(page.getByRole('button', { name: 'Close Dude' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Open Hips' }).first()).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Open Hips' }).first().click();
    await expect(page.getByRole('list', { name: 'Inside Hips' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'View' }).getByRole('option')).toHaveText(['Free view', 'Turntable']);
    await expect(page.locator('svg.scene [data-shape-id]').first()).toBeAttached();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Shapes' }).getByRole('button', { name: /^Ground/ })).toHaveCount(0);
  });
});

test.describe('File ▾ › Example: Nippu, walking', () => {
  openEditorForEachTest(test);

  test('opens the couple walking: their limbs are keyed and the pose changes with the frame', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept());
    await fileMenu(page, 'Example: Nippu, walking');
    await expect(page.getByRole('status')).toContainText('walk');
    const timeline = page.getByRole('region', { name: 'Timeline' });
    await expect(timeline.getByRole('button', { name: 'Right thigh' }).first()).toBeVisible();
    await expect(timeline.getByRole('button', { name: 'Hips' }).first()).toBeVisible();

    const drawing = () => page.locator('svg.scene').innerHTML();
    await afterRedraw(page);
    const first = await drawing();
    await page.getByLabel('Frame', { exact: true }).fill('15');
    await page.getByLabel('Frame', { exact: true }).press('Enter');
    await afterRedraw(page);
    expect(await drawing()).not.toBe(first);
  });
});

