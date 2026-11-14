import { deleteShape, duplicate, select, type Command } from './commands';

/** The parts of a KeyboardEvent the shortcuts look at. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * The command for a key press, or null if it isn't a shortcut.
 *   Delete / Backspace  delete the selected shape
 *   Ctrl+D (Cmd+D)      duplicate the selected shape
 *   Escape              clear the selection
 */
export function shortcutCommand(press: KeyPress, selectedId: string | null): Command | null {
  const modifier = press.ctrlKey || press.metaKey;
  if (!modifier && !press.altKey && (press.key === 'Delete' || press.key === 'Backspace')) {
    return selectedId === null ? null : deleteShape(selectedId);
  }
  if (modifier && !press.shiftKey && !press.altKey && press.key.toLowerCase() === 'd') {
    return selectedId === null ? null : duplicate(selectedId);
  }
  if (press.key === 'Escape' && !modifier) {
    return selectedId === null ? null : select(null);
  }
  return null;
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
