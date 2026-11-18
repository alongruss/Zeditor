import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH } from './limits';
import { cleanName } from './names';

describe('cleanName', () => {
  it('keeps ordinary names, emoji and other scripts as they are', () => {
    for (const name of ['Box 1', 'Crème brûlée', '箱', 'Rocket 🚀', 'שלום']) expect(cleanName(name)).toBe(name);
  });

  it('turns control characters into spaces, joins runs of spaces and trims', () => {
    expect(cleanName('  Big\tred\n\nbox\u0000 ')).toBe('Big red box');
    expect(cleanName('\u0007\u001b[31m')).toBe('[31m');
  });

  it('drops the invisible marks that flip text direction', () => {
    expect(cleanName('evil‮txt.exe')).toBe('evil txt.exe');
    expect(cleanName('⁦a⁩')).toBe('a');
  });

  it('cuts long names without splitting a character in two', () => {
    expect(Array.from(cleanName('x'.repeat(500)))).toHaveLength(MAX_NAME_LENGTH);
    const emoji = cleanName('🚀'.repeat(MAX_NAME_LENGTH + 5));
    expect(Array.from(emoji)).toHaveLength(MAX_NAME_LENGTH);
    expect(emoji.endsWith('🚀')).toBe(true);
  });

  it('gives an empty name for one with nothing but spaces and marks', () => {
    expect(cleanName(' ‮\t')).toBe('');
  });
});
