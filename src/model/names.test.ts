import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH } from './limits';
import { cleanName, safeFileName } from './names';

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

describe('safeFileName', () => {
  it('keeps ordinary names as they are', () => {
    expect(safeFileName('nippu-walking')).toBe('nippu-walking');
    expect(safeFileName('קופסה גדולה')).toBe('קופסה גדולה');
  });

  it('replaces characters computers refuse in file names', () => {
    expect(safeFileName('a\\b/c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(safeFileName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(safeFileName('evil‮txt.exe')).toBe('evil txt.exe');
  });

  it('takes dots and spaces off the ends, and stops at 100 characters', () => {
    expect(safeFileName('  scene. . ')).toBe('scene');
    expect(Array.from(safeFileName('😀'.repeat(300)))).toHaveLength(100);
  });

  it('gives "scene" when nothing usable is left, or for names Windows keeps', () => {
    for (const name of ['', '...', ' \t ', 'CON', 'nul', 'com1', 'Lpt9', 'con.backup']) expect(safeFileName(name), name).toBe('scene');
    expect(safeFileName('console')).toBe('console');
  });
});
