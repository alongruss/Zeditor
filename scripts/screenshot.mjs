// Takes a screenshot of the editor at 1280x720 with a shape selected, for
// before/after comparisons in pull requests.
//
//   node scripts/screenshot.mjs <url> <out.png> [shape name]
//
// Needs the Playwright browser (npx playwright install chromium).
import { chromium } from '@playwright/test';

const [url, out, shape = 'Box 1'] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node scripts/screenshot.mjs <url> <out.png> [shape name]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.locator('svg.scene [data-shape-id]').first().waitFor({ state: 'attached' });
await page.getByRole('button', { name: new RegExp(`^${shape}\\b`) }).first().click();
// Two frames, so the selection outline and gizmo are drawn.
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
await page.screenshot({ path: out });
await browser.close();
console.log(`Saved ${out}`);
