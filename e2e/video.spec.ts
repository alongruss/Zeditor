import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { starterScene } from '../src/model/starterScene';
import { rootTranslate, viewFromFreeView } from '../src/render/view';
import { DEFAULT_FREE_VIEW } from '../src/viewport/freeView';
import { zdogOptions } from '../src/viewport/toZdog';
import { field, fileMenu, openEditorForEachTest } from './helpers';

openEditorForEachTest(test);

const ZDOG = 'node_modules/zdog/dist/zdog.dist.min.js';
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Export video' });

async function openVideoDialog(page: Page) {
  await fileMenu(page, 'Export video (MP4)…');
  await expect(dialogOf(page)).toBeVisible();
}

async function setSize(page: Page, width: number, height: number) {
  await dialogOf(page).getByLabel('Width').fill(String(width));
  await dialogOf(page).getByLabel('Height').fill(String(height));
}

/** Exports with the dialog's Export button and returns the downloaded file. */
async function exportVideo(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const download = page.waitForEvent('download');
  await dialogOf(page).getByRole('button', { name: 'Export' }).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

test('exports the animation as an MP4 that plays for its length, at an even size, looking like zdog draws it', async ({ page, context }) => {
  await openVideoDialog(page);
  await expect(dialogOf(page)).toContainText('90 frames, 3.0 s at 30 fps');
  // Odd sizes are made even, and it says so.
  await setSize(page, 321, 240);
  await expect(dialogOf(page)).toContainText('Videos need even sizes, so it will be 320 x 240.');
  const video = await exportVideo(page);
  expect(video.name).toBe('scene.mp4');
  expect(video.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  await expect(dialogOf(page)).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Saved scene.mp4');

  // Play it in a blank page, and compare its first frame with zdog drawing the starter scene.
  const scene = starterScene();
  const view = viewFromFreeView(DEFAULT_FREE_VIEW, 320, 240)!;
  const shapes = scene.shapes.map((shape) => ({ type: shape.type, options: zdogOptions(shape) }));
  const blank = await context.newPage();
  await blank.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  await blank.addScriptTag({ path: ZDOG });
  const result = await blank.evaluate(
    async ({ base64, shapes, view, translate, background }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const element = document.createElement('video');
      element.muted = true;
      element.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      document.body.append(element);
      await new Promise((done, fail) => {
        element.onloadeddata = done;
        element.onerror = () => fail(new Error('the video would not load'));
      });
      element.currentTime = 0.5 / 30; // the middle of frame 0
      await new Promise((done) => (element.onseeked = done));
      const size = { width: element.videoWidth, height: element.videoHeight, duration: element.duration };

      const played = document.createElement('canvas');
      played.width = view.width;
      played.height = view.height;
      played.getContext('2d')!.drawImage(element, 0, 0);

      // zdog's own drawing, over the background.
      const w = window as unknown as { Zdog: Record<string, new (options: object) => { updateRenderGraph(): void }> };
      const drawn = document.createElement('canvas');
      drawn.width = view.width;
      drawn.height = view.height;
      const illo = new w.Zdog.Illustration({ element: drawn, zoom: view.pixelsPerUnit, rotate: view.rotate, translate, resize: false });
      for (const shape of shapes) new w.Zdog[shape.type]({ ...shape.options, addTo: illo });
      illo.updateRenderGraph();
      const reference = document.createElement('canvas');
      reference.width = view.width;
      reference.height = view.height;
      const ctx = reference.getContext('2d')!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, view.width, view.height);
      ctx.drawImage(drawn, 0, 0);

      const a = played.getContext('2d')!.getImageData(0, 0, view.width, view.height).data;
      const b = ctx.getImageData(0, 0, view.width, view.height).data;
      const shape = drawn.getContext('2d')!.getImageData(0, 0, view.width, view.height).data;
      let ink = 0;
      let off = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (shape[i + 3] > 0) ink += 1;
        const diff = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (diff > 48) off += 1;
      }
      return { ...size, ink, off: off / (a.length / 4) };
    },
    {
      base64: video.bytes.toString('base64'),
      shapes,
      view,
      translate: rootTranslate(view),
      background: scene.settings.background,
    },
  );
  expect(result).toMatchObject({ width: 320, height: 240 });
  expect(result.duration).toBeCloseTo(3, 1);
  expect(result.ink, 'zdog drew the shapes').toBeGreaterThan(5000);
  // H.264 is lossy: edges blur a little (about 0.1% of pixels here); everything else must match.
  expect(result.off).toBeLessThan(0.01);
});

test('films through a camera at its own size, following it as it turns', async ({ page }) => {
  // The shapes stay still; only the camera turns, from frame 0 to 60.
  await page.getByRole('button', { name: 'Add ▾' }).click();
  await page.getByRole('menuitem', { name: 'Camera' }).click();
  await page.getByRole('button', { name: /^Animate Angle at frame 0/ }).click();
  await page.getByLabel('Frame', { exact: true }).fill('60');
  await page.getByLabel('Frame', { exact: true }).press('Enter');
  await field(page, 'Angle Y').fill('90');
  await field(page, 'Angle Y').press('Tab');

  await openVideoDialog(page);
  await dialogOf(page).getByLabel('View').selectOption({ label: 'Camera 1' });
  await expect(dialogOf(page).getByLabel('Width')).toBeDisabled();
  const video = await exportVideo(page);
  const frames = await page.evaluate(async (base64) => {
    const element = document.createElement('video');
    element.muted = true;
    element.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    await new Promise((done) => (element.onloadeddata = done));
    const grab = async (time: number) => {
      element.currentTime = time;
      await new Promise((done) => (element.onseeked = done));
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(element, 0, 0);
      return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((_, i) => i % 16 === 0));
    };
    return { width: element.videoWidth, height: element.videoHeight, first: await grab(0.01), later: await grab(1.5) };
  }, video.bytes.toString('base64'));
  expect(frames.width % 2).toBe(0);
  expect(frames.height % 2).toBe(0);
  const changed = frames.first.filter((v, i) => Math.abs(v - frames.later[i]) > 40).length;
  expect(changed).toBeGreaterThan(50);
});

test('says calmly when the browser cannot make MP4 video, and Export stays off', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { VideoEncoder?: unknown }).VideoEncoder = undefined;
  });
  await openVideoDialog(page);
  await expect(dialogOf(page).getByRole('alert')).toHaveText("This browser can't make MP4 videos. Chrome, Edge and Safari can.");
  await expect(dialogOf(page).getByRole('button', { name: 'Export' })).toBeDisabled();
  await dialogOf(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialogOf(page)).toBeHidden();
});

test('shows how far it has got, and Stop stops it without a download', async ({ page }) => {
  // A longer, bigger video, so there's time to stop it.
  await page.getByLabel('Length in frames', { exact: true }).fill('600');
  await page.getByLabel('Length in frames', { exact: true }).press('Tab');
  await openVideoDialog(page);
  await setSize(page, 1280, 720);
  let downloads = 0;
  page.on('download', () => (downloads += 1));
  await dialogOf(page).getByRole('button', { name: 'Export' }).click();
  await expect(dialogOf(page).getByRole('status')).toContainText(/Making frame \d+ of 600/);
  await expect(dialogOf(page).getByRole('progressbar', { name: 'Video progress' })).toBeVisible();
  await dialogOf(page).getByRole('button', { name: 'Stop' }).click();
  await expect(dialogOf(page).getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(dialogOf(page).getByRole('progressbar')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
  await expect(dialogOf(page)).toBeVisible();
});
