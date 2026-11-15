import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Checks the design tokens in styles.css against WCAG 2 contrast minimums:
 * 4.5:1 for text, 3:1 for the edges of controls, key diamonds and focus
 * rings. Tokens are read from the file itself, so a changed value is checked.
 */

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

/** The `:root { … }` block's custom properties. */
function rootTokens(): Map<string, string> {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
  return tokens;
}

const tokens = rootTokens();

/** A token's hex color (or a literal hex), as 0–255 channels. */
function rgb(name: string): [number, number, number] {
  const value = name.startsWith('#') ? name : tokens.get(name);
  const hex = value && /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (!hex) throw new Error(`${name} is not a #rrggbb color: ${value}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const EDGE = 3;

const PAIRS: [string, string, number, string][] = [
  ['--text', '--panel-bg', TEXT, 'body text'],
  ['--text', '--group-bg', TEXT, 'text in Inspector groups'],
  ['--text', '--hover-bg', TEXT, 'text on hover and selected rows'],
  ['--text', '--anim-key-bg', TEXT, 'a field keyed on this frame'],
  ['--text', '--anim-tween-bg', TEXT, 'an animated field between keys'],
  ['--text-muted', '--panel-bg', TEXT, 'muted text'],
  ['--text-muted', '--group-bg', TEXT, 'muted text in groups'],
  ['--text-muted', '--hover-bg', TEXT, 'muted text on hover'],
  ['--accent', '--panel-bg', TEXT, 'violet text (selected timeline row)'],
  ['--danger', '--panel-bg', TEXT, 'error text'],
  ['#ffffff', '--accent', TEXT, 'primary button text'],
  ['#ffffff', '--accent-pressed', TEXT, 'pressed primary button text'],
  ['#ffffff', '--danger', TEXT, 'error notice text'],
  ['--border-field', '--panel-bg', EDGE, 'field and button edges'],
  ['--border-field', '--group-bg', EDGE, 'field edges in groups'],
  ['--key-edge', '--panel-bg', EDGE, 'key diamond edges'],
  ['--key-edge', '--group-bg', EDGE, 'key buttons in groups'],
  ['--summary-key-edge', '--panel-bg', EDGE, 'summary key edges'],
  ['--accent', '--panel-bg', EDGE, 'focus ring'],
  ['--accent', '--page-bg', EDGE, 'focus ring on the page'],
  ['--accent', '--hover-bg', EDGE, 'focus ring on a hovered control'],
  ['--accent', '--scene-bg', EDGE, 'focus ring over the default scene'],
  ['--select', '#ffffff', EDGE, 'selection outline against its white halo'],
];

describe('design tokens', () => {
  it.each(PAIRS)('%s on %s is at least %d:1 (%s)', (foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });

  it('match the values the brief was checked with', () => {
    // A few anchors from docs/REDESIGN.md, so a typo in a token is caught here.
    expect(contrast('#ffffff', '--accent')).toBeCloseTo(5.85, 2);
    expect(contrast('--text', '#ffffff')).toBeCloseTo(17.04, 2);
    expect(contrast('--border-field', '#ffffff')).toBeCloseTo(3.61, 2);
    expect(contrast('--key-edge', '#ffffff')).toBeCloseTo(4.1, 2);
  });

  it('are the only colors outside the scene overlays', () => {
    // Colors written straight into rules (outside :root) must be one of
    // these: the gizmo's axis colors and the white/black washes drawn over
    // the scene itself (camera frames and the letterbox).
    const allowed = new Set(['#e5484d', '#2f9e5a', '#3e63dd', 'rgb(255 255 255 / 85%)', 'rgb(255 255 255 / 70%)', 'rgb(0 0 0 / 35%)']);
    const rules = css.replace(/:root\s*\{[\s\S]*?\n\}/, '');
    const found = rules.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
    expect(found.filter((color) => !allowed.has(color.toLowerCase()))).toEqual([]);
  });
});
