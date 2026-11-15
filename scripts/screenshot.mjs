// Takes a screenshot of the editor at 1280x720 with a shape selected, for
// before/after comparisons in pull requests.
//
//   node scripts/screenshot.mjs <url> <out.png> [shape name] [--open-add] [--dark]
//
// With --open-add, the Add menu is open in the picture; with --dark, the
// system asks for the dark theme.
//
// Needs the Playwright browser (npx playwright install chromium).
import process from 'node:process';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const openAdd = args.includes('--open-add');
const dark = args.includes('--dark');
const [url, out, shape = 'Box 1'] = args.filter((arg) => !arg.startsWith('--'));
if (!url || !out) {
  console.error('Usage: node scripts/screenshot.mjs <url> <out.png> [shape name]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, colorScheme: dark ? 'dark' : 'light' });
await page.goto(url);
await page.locator('svg.scene [data-shape-id]').first().waitFor({ state: 'attached' });
await page.getByRole('button', { name: new RegExp(`^${shape}\\b`) }).first().click();
// Two frames, so the selection outline and gizmo are drawn.
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
if (openAdd) await page.getByRole('button', { name: 'Add ▾' }).click();
await page.screenshot({ path: out });
await browser.close();
console.log(`Saved ${out}`);
