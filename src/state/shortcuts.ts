import { deleteShape, duplicate, select, type Command } from './commands';

/** The parts of a KeyboardEvent the shortcuts look at. */
export interface KeyPress {
  readonly key: string;
  /** Physical key, e.g. "KeyZ". Used when the keyboard layout isn't Latin. */
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** What a shortcut does: run a command, step through the undo history, or save/open a file. */
export type Shortcut = Command | 'undo' | 'redo' | 'save' | 'open';

/** Leaves the state alone. Claims a key so the browser's own action doesn't run. */
const nothing: Command = (state) => state;

/**
 * The letter a shortcut key stands for, in lower case. On a non-Latin layout
 * (Hebrew, Russian, ...) `key` is that layout's letter, so the physical key
 * decides instead: Ctrl+Z is the same key whatever the layout.
 */
function letterOf(press: KeyPress): string {
  const key = press.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const physical = /^Key([A-Z])$/.exec(press.code ?? '');
  return physical ? physical[1].toLowerCase() : key;
}

/**
 * What a key press does, or null if it isn't a shortcut.
 *   Delete / Backspace              delete the selected shape
 *   Ctrl+D (Cmd+D)                  duplicate the selected shape
 *   Escape                          clear the selection
 *   Ctrl+Z (Cmd+Z)                  undo
 *   Ctrl+Shift+Z, Ctrl+Y (Cmd too)  redo
 *   Ctrl+S (Cmd+S)                  save the scene file (not the web page)
 *   Ctrl+O (Cmd+O)                  open a scene file
 */
export function shortcutFor(press: KeyPress, selectedId: string | null): Shortcut | null {
  const modifier = press.ctrlKey || press.metaKey;
  if (!modifier && !press.altKey && (press.key === 'Delete' || press.key === 'Backspace')) {
    return selectedId === null ? null : deleteShape(selectedId);
  }
  if (press.key === 'Escape' && !modifier) {
    return selectedId === null ? null : select(null);
  }
  if (!modifier || press.altKey) return null;

  const letter = letterOf(press);
  if (letter === 'z') return press.shiftKey ? 'redo' : 'undo';
  if (letter === 'y' && !press.shiftKey) return 'redo';
  if (letter === 's' && !press.shiftKey) return 'save';
  if (letter === 'o' && !press.shiftKey) return 'open';
  if (letter === 'd' && !press.shiftKey) {
    // Ctrl+D would otherwise bookmark the page, so claim it even with nothing selected.
    return selectedId === null ? nothing : duplicate(selectedId);
  }
  return null;
}

/**
 * Marks a text field that applies each keystroke to the scene straight away
 * (the Inspector's number and hex fields). Its typing is already in the undo
 * history, so Undo and Redo act on the scene even while it has focus, instead
 * of the browser's own text undo.
 */
export const LIVE_FIELD_ATTRIBUTE = 'data-live-field';

/** True for the undo and redo shortcuts. */
export function isHistoryShortcut(press: KeyPress): boolean {
  const shortcut = shortcutFor(press, null);
  return shortcut === 'undo' || shortcut === 'redo';
}

/**
 * Whether a shortcut may run while `target` has focus. While typing, Save
 * and Open still work (they don't touch the text), and Undo and Redo only in
 * live fields.
 */
export function shortcutAllowedIn(target: EventTarget | null, shortcut: Shortcut): boolean {
  if (!isTypingTarget(target) || shortcut === 'save' || shortcut === 'open') return true;
  const history = shortcut === 'undo' || shortcut === 'redo';
  return history && target instanceof HTMLElement && target.hasAttribute(LIVE_FIELD_ATTRIBUTE);
}

/** True while the user is typing somewhere, so shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range'].includes(target.type);
  }
  return false;
}
