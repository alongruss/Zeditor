import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openEditorForEachTest } from './helpers';

openEditorForEachTest(test);

const DARK_PANEL = 'rgb(28, 26, 34)';
const LIGHT_PANEL = 'rgb(255, 255, 255)';
const SCENE = 'rgb(255, 221, 187)';

const panelColor = (page: Page) => page.locator('.scene-panel').evaluate((el) => getComputedStyle(el).backgroundColor);
const sceneColor = (page: Page) => page.locator('.viewport').evaluate((el) => getComputedStyle(el).backgroundColor);

async function chooseTheme(page: Page, label: string) {
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitemradio', { name: label }).click();
}

test('the theme follows the system, and the scene keeps its own color', async ({ page }) => {
  expect(await panelColor(page)).toBe(LIGHT_PANEL);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => panelColor(page)).toBe(DARK_PANEL);
  expect(await sceneColor(page)).toBe(SCENE);
  // Text on the dark panels is light, and the primary button's text is ink.
  const exportText = await page.getByRole('button', { name: 'Export ▾' }).evaluate((el) => getComputedStyle(el).color);
  expect(exportText).toBe('rgb(29, 27, 34)');
});

test('File ▾ chooses light or dark over the system, and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await chooseTheme(page, 'Theme: light');
  await expect.poll(() => panelColor(page)).toBe(LIGHT_PANEL);
  await page.reload();
  expect(await panelColor(page)).toBe(LIGHT_PANEL);

  await page.getByRole('button', { name: 'File ▾' }).click();
  const menu = page.getByRole('menu', { name: 'File' });
  await expect(menu.getByRole('menuitemradio', { name: 'Theme: light' })).toHaveAttribute('aria-checked', 'true');
  await expect(menu.getByRole('menuitemradio', { name: 'Theme: match system' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await page.emulateMedia({ colorScheme: 'light' });
  await chooseTheme(page, 'Theme: dark');
  await expect.poll(() => panelColor(page)).toBe(DARK_PANEL);
  await chooseTheme(page, 'Theme: match system');
  await expect.poll(() => panelColor(page)).toBe(LIGHT_PANEL);
});
