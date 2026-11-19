import fc from 'fast-check';
import { expect, test } from '@playwright/test';
import { parseCssColor } from '../src/model/cssColor';

/** Colour-like text built from the pieces people (and files) get wrong. */
const piece = fc.constantFrom('', ' ', '0', '1', '1.', '.5', '+3', '-2', '1e2', '1e999', '0x10', '50%', '%', 'deg', ',', '(', ')', 'a', '#');
const colorish = fc.oneof(
  fc
    .tuple(fc.constantFrom('rgb', 'rgba', 'hsl', 'hsla', 'RGB', 'Hsl'), fc.array(fc.array(piece, { maxLength: 3 }).map((p) => p.join('')), { maxLength: 5 }))
    .map(([name, parts]) => `${name}(${parts.join(',')})`),
  fc.array(fc.constantFrom('#', 'a', 'f', '0', '9', 'g', 'red', ' '), { maxLength: 9 }).map((p) => p.join('')),
);

const HAND_PICKED = [
  'red',
  'Transparent',
  '#abc',
  '#33AA6633',
  'rgb(1, 2, 3)',
  'rgba(1,2,3,0.5)',
  'rgb(100%, 0%, 50%)',
  'rgb(1e2, .5, +3)',
  'hsl(120deg, 50%, 50%)',
  'hsla(-120, 100%, 50%, 50%)',
  'hsl(,50%,50%)',
  'rgb(100%, 0, 0)',
  'rgb(1., 2, 3)',
  'hsl(10%, 50%, 50%)',
];

test('every colour the editor accepts, the browser draws', async ({ page }) => {
  await page.goto('about:blank');
  const texts = [...HAND_PICKED, ...fc.sample(colorish, { numRuns: 3000, seed: 7 })];
  const accepted = texts.filter((text) => parseCssColor(text) !== null);
  expect(accepted.length).toBeGreaterThan(HAND_PICKED.length / 2);
  const browser = await page.evaluate((list) => list.map((text) => CSS.supports('color', text)), accepted);
  const refusedByBrowser = accepted.filter((_, i) => !browser[i]);
  expect(refusedByBrowser).toEqual([]);
});
