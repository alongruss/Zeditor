import { describe, expect, it } from 'vitest';
import { alphaPercent, fadeColor, isHexColor, toPickerHex, withAlphaOf, withAlphaPercent } from './color';

describe('isHexColor', () => {
  it('accepts 3, 4, 6 and 8 digit hex colors only', () => {
    for (const ok of ['#abc', '#abcd', '#aabbcc', '#AABBCC33']) expect(isHexColor(ok)).toBe(true);
    for (const bad of ['abc', '#ab', '#abcde', 'red', '#gggggg']) expect(isHexColor(bad)).toBe(false);
  });
});

describe('toPickerHex', () => {
  it('gives the color picker a #rrggbb value', () => {
    expect(toPickerHex('#33AA6633')).toBe('#33aa66');
    expect(toPickerHex('#fed')).toBe('#ffeedd');
    expect(toPickerHex('#fed8')).toBe('#ffeedd');
    expect(toPickerHex('red')).toBe('#000000');
  });
});

describe('alphaPercent', () => {
  it('reads alpha as a whole percentage', () => {
    expect(alphaPercent('#33AA6633')).toBe(20);
    expect(alphaPercent('#33aa66')).toBe(100);
    expect(alphaPercent('#f008')).toBe(53);
    expect(alphaPercent('#00000000')).toBe(0);
    expect(alphaPercent('red')).toBeNull();
  });
});

describe('withAlphaPercent', () => {
  it('sets alpha, dropping it again at 100%', () => {
    expect(withAlphaPercent('#33aa66', 50)).toBe('#33aa6680');
    expect(withAlphaPercent('#33AA6633', 0)).toBe('#33aa6600');
    expect(withAlphaPercent('#33AA6633', 100)).toBe('#33aa66');
    expect(withAlphaPercent('#fed', 20)).toBe('#ffeedd33');
    expect(withAlphaPercent('red', 50)).toBe('red');
  });

  it('round-trips every whole percentage', () => {
    for (let percent = 0; percent <= 100; percent++) {
      expect(alphaPercent(withAlphaPercent('#123456', percent))).toBe(percent);
    }
  });
});

describe('withAlphaOf', () => {
  it('keeps transparency when a new color is picked', () => {
    expect(withAlphaOf('#112233', '#33AA6633')).toBe('#11223333');
    expect(withAlphaOf('#112233', '#33aa66')).toBe('#112233');
    expect(withAlphaOf('#112233', '#f008')).toBe('#11223388');
  });
});

describe('fadeColor', () => {
  it('multiplies the alpha by the opacity', () => {
    expect(fadeColor('#ee6622', 0.5)).toBe('#ee662280');
    expect(fadeColor('#33AA6680', 0.5)).toBe('#33aa6640');
    expect(fadeColor('#ee6622', 0)).toBe('#ee662200');
  });

  it('leaves the color alone at full opacity, or if it is not hex', () => {
    expect(fadeColor('#EE6622', 1)).toBe('#EE6622');
    expect(fadeColor('red', 0.5)).toBe('red');
  });
});
