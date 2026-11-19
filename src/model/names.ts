import { MAX_NAME_LENGTH } from './limits';

/**
 * Characters a name can't hold: control characters (tabs, line breaks, NUL)
 * and the invisible marks that flip the direction of text around them, which
 * can make a name show as something else.
 */
// eslint-disable-next-line no-control-regex
const UNWANTED = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

/**
 * A name as the editor keeps it: unwanted characters become spaces, runs of
 * spaces become one, the ends are trimmed, and it's at most MAX_NAME_LENGTH
 * characters (never cut through the middle of an emoji or other character).
 * Empty if nothing is left.
 */
export function cleanName(name: string): string {
  const cleaned = name.replace(UNWANTED, ' ').replace(/\s+/g, ' ').trim();
  const characters = Array.from(cleaned);
  return characters.length <= MAX_NAME_LENGTH ? cleaned : characters.slice(0, MAX_NAME_LENGTH).join('').trimEnd();
}

const MAX_FILE_NAME = 100;

/**
 * A name any computer can save a file under: no characters Windows, macOS or
 * Linux refuse (\ / : * ? " < > |), no control characters or direction marks,
 * no dots or spaces at either end, not a name Windows keeps for itself (CON,
 * NUL…), and at most 100 characters. "scene" if nothing is left.
 */
export function safeFileName(name: string): string {
  // Control characters and direction marks are already gone (cleanName).
  const replaced = cleanName(name).replace(/[\\/:*?"<>|]/g, '-');
  const cut = Array.from(replaced).slice(0, MAX_FILE_NAME).join('');
  const trimmed = cut.replace(/[. ]+$/, '').replace(/^[. ]+/, '');
  return trimmed === '' || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(trimmed) ? 'scene' : trimmed;
}
