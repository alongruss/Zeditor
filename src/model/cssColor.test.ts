import { describe, expect, it } from 'vitest';
import { parseCssColor } from './cssColor';

describe('parseCssColor', () => {
  it('reads hex colors, with or without alpha', () => {
    expect(parseCssColor('#ee6622')).toEqual({ r: 238, g: 102, b: 34, a: 1 });
    expect(parseCssColor('#33AA6633')).toEqual({ r: 51, g: 170, b: 102, a: 0.2 });
    expect(parseCssColor('#fed')).toEqual({ r: 255, g: 238, b: 221, a: 1 });
    expect(parseCssColor('#f008')?.a).toBeCloseTo(0x88 / 255);
  });

  it('reads color names and transparent', () => {
    expect(parseCssColor('rebeccapurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseCssColor('White')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('reads rgb() and rgba(), numbers or percentages', () => {
    expect(parseCssColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseCssColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('rgb(100%, 0%, 50%)')).toEqual({ r: 255, g: 0, b: 127.5, a: 1 });
  });

  it('reads hsl() and hsla()', () => {
    const red = parseCssColor('hsl(0, 100%, 50%)')!;
    expect([red.r, red.g, red.b].map(Math.round)).toEqual([255, 0, 0]);
    const green = parseCssColor('hsla(120deg, 100%, 25%, 0.5)')!;
    expect([green.r, green.g, green.b].map(Math.round)).toEqual([0, 128, 0]);
    expect(green.a).toBe(0.5);
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'nope', '#12', 'rgb(1,2)', 'url(x.png)', 'hsl(1, 2, 3)', 'rgb(a, b, c)', 'red;']) {
      expect(parseCssColor(bad), bad).toBeNull();
    }
  });

  it('refuses what browsers refuse: empty parts, mixed units, odd numbers', () => {
    const bad = [
      'hsl(,50%,50%)',
      'hsl(0x10, 50%, 50%)',
      'hsl(10%, 50%, 50%)',
      'hsl(1e999, 50%, 50%)',
      'rgb(100%, 0, 0)',
      'rgb(1., 2, 3)',
      'rgb(1, 2, 3,)',
      'rgb(, 2, 3)',
      'rgb(1 2 3)',
      'rgb(1e999, 0, 0)',
    ];
    for (const text of bad) expect(parseCssColor(text), text).toBeNull();
    expect(parseCssColor('rgb(1e2, .5, +3)')).toEqual({ r: 100, g: 0.5, b: 3, a: 1 });
    expect(parseCssColor('hsl(-120, 100%, 50%, 50%)')?.a).toBe(0.5);
  });
});
