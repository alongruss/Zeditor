import { deleteObjects, duplicateObjects, select, selectAll, type Command } from './commands';

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

/** What a shortcut does: run a command, or one of the editor's other actions. */
export type Shortcut =
  | Command
  | 'undo'
  | 'redo'
  | 'save'
  | 'open'
  | 'togglePlay'
  | 'deleteKeys'
  | 'firstFrame'
  | 'lastFrame'
  | 'group'
  | 'ungroup'
  | { readonly stepFrames: number };

/** Timeline shortcuts, which act on the playhead or selected keys rather than the page's focus. */
const isTimelineShortcut = (shortcut: Shortcut): boolean =>
  shortcut === 'togglePlay' || shortcut === 'firstFrame' || shortcut === 'lastFrame' || typeof shortcut === 'object';

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
 *   Delete / Backspace              delete the selection
 *   Ctrl+D (Cmd+D)                  duplicate the selection
 *   Ctrl+A (Cmd+A)                  select everything
 *   Ctrl+G (Cmd+G)                  put the selection in a new group
 *   Ctrl+Shift+G (Cmd too)          ungroup the selected groups
 *   Escape                          clear the selection
 *   Ctrl+Z (Cmd+Z)                  undo
 *   Ctrl+Shift+Z, Ctrl+Y (Cmd too)  redo
 *   Ctrl+S (Cmd+S)                  save the scene file (not the web page)
 *   Ctrl+O (Cmd+O)                  open a scene file
 *   Space                           play / pause
 *   Left / Right (Shift: 10)        step the playhead
 *   Home / End                      first / last frame
 * With keys selected in the timeline, Delete / Backspace delete those keys
 * instead of the shape.
 */
export function shortcutFor(
  press: KeyPress,
  selected: string | null | readonly string[],
  keysSelected = false,
): Shortcut | null {
  const selection = selected === null ? [] : typeof selected === 'string' ? [selected] : selected;
  const modifier = press.ctrlKey || press.metaKey;
  if (!modifier && !press.altKey && (press.key === 'Delete' || press.key === 'Backspace')) {
    if (keysSelected) return 'deleteKeys';
    return selection.length === 0 ? null : deleteObjects(selection);
  }
  if (!modifier && !press.altKey) {
    if (press.key === ' ' && !press.shiftKey) return 'togglePlay';
    if (press.key === 'ArrowLeft') return { stepFrames: press.shiftKey ? -10 : -1 };
    if (press.key === 'ArrowRight') return { stepFrames: press.shiftKey ? 10 : 1 };
    if (press.key === 'Home' && !press.shiftKey) return 'firstFrame';
    if (press.key === 'End' && !press.shiftKey) return 'lastFrame';
  }
  if (press.key === 'Escape' && !modifier) {
    return selection.length === 0 ? null : select(null);
  }
  if (!modifier || press.altKey) return null;

  const letter = letterOf(press);
  if (letter === 'z') return press.shiftKey ? 'redo' : 'undo';
  if (letter === 'y' && !press.shiftKey) return 'redo';
  if (letter === 's' && !press.shiftKey) return 'save';
  if (letter === 'o' && !press.shiftKey) return 'open';
  // Ctrl+G is the browser's "find next": always claimed, even with nothing to group.
  if (letter === 'g') return press.shiftKey ? 'ungroup' : 'group';
  if (letter === 'd' && !press.shiftKey) {
    // Ctrl+D would otherwise bookmark the page, so claim it even with nothing selected.
    return selection.length === 0 ? nothing : duplicateObjects(selection);
  }
  if (letter === 'a' && !press.shiftKey) return selectAll;
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
  // Space ticks a checkbox and opens a select; arrows move within them.
  if (isTimelineShortcut(shortcut) && isChoiceControl(target)) return false;
  if (!isTypingTarget(target) || shortcut === 'save' || shortcut === 'open') return true;
  const history = shortcut === 'undo' || shortcut === 'redo';
  return history && target instanceof HTMLElement && target.hasAttribute(LIVE_FIELD_ATTRIBUTE);
}

/** A control where Space and the arrow keys already mean something (checkbox, radio, select). */
function isChoiceControl(target: EventTarget | null): boolean {
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'color'].includes(target.type);
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
