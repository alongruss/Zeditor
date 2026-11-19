import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { exportZdogScript } from '../src/export/zdogScript';
import { setKey } from '../src/model/animation';
import { addShape, createShape, emptyScene } from '../src/model/scene';

const ZDOG = readFileSync('node_modules/zdog/dist/zdog.dist.min.js', 'utf8');

test('an exported script pasted into a page as an inline <script> runs, whatever the shapes are called', async ({ page }) => {
  const names = ['</script><script>window.escaped = true</script>', '<!-- <script>', 'top', 'location', 'self', '__proto__', 'Wheel ²', 'Колесо'];
  let scene = emptyScene();
  for (const name of names) scene = addShape(scene, { ...createShape(scene, 'Box'), name });
  scene = { ...scene, shapes: [setKey(scene.shapes[0], 'translate.x', 10, 3), ...scene.shapes.slice(1)] };
  const script = exportZdogScript(scene, { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: 20 });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The page as HTML text, so the browser's own HTML reader decides where each script ends.
  await page.setContent(`<!doctype html><html><body><script>${ZDOG}</script><script>${script}</script></body></html>`);
  await expect(page.locator('canvas.zeditor-scene')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { escaped?: boolean }).escaped)).toBeUndefined();
  // Every shape was made.
  const made = await page.evaluate(() => (new Function('return illo')() as { children: unknown[] }).children.length);
  expect(made).toBe(names.length);
});
