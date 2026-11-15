import type { Scene } from '../model/types';
import type { Command, EditorState } from './commands';

/** How many undo steps are kept. Older ones are dropped. */
export const HISTORY_LIMIT = 100;

/**
 * One undo step: the editor state just before a change and just after it.
 * Undo returns to `before`, Redo to `after`, so either way the shape that
 * changed is selected again. Snapshots are cheap because scene data is
 * immutable: unchanged shapes are shared between them.
 */
export interface Step {
  readonly before: EditorState;
  readonly after: EditorState;
}

/** The editor state plus everything needed to undo and redo it. */
export interface History {
  readonly present: EditorState;
  /** Oldest first; the last step is the one Undo reverts. */
  readonly past: readonly Step[];
  /** Nearest first; the first step is the one Redo re-applies. */
  readonly future: readonly Step[];
  /** Group of the newest step while more changes may still join it. */
  readonly openGroup: string | null;
}

let groupCount = 0;

/**
 * A new id for a group of changes that should undo as one step, such as
 * every value set during one drag or one visit to a text field.
 */
export function newGroup(): string {
  groupCount += 1;
  return `group-${groupCount}`;
}

export function startHistory(present: EditorState): History {
  return { present, past: [], future: [], openGroup: null };
}

/**
 * True when two scenes hold the same data, even if they are different
 * objects. Shape by shape, skipping shapes that are the very same object, so
 * a drag doesn't turn the whole scene into text on every move.
 */
function sameScene(a: Scene, b: Scene): boolean {
  if (a === b) return true;
  if (a.shapes.length !== b.shapes.length || a.cameras.length !== b.cameras.length || a.version !== b.version) {
    return false;
  }
  if (a.settings !== b.settings && JSON.stringify(a.settings) !== JSON.stringify(b.settings)) return false;
  const same = <T>(x: readonly T[], y: readonly T[]) =>
    x.every((item, i) => item === y[i] || JSON.stringify(item) === JSON.stringify(y[i]));
  return same(a.shapes, b.shapes) && same(a.cameras, b.cameras);
}

/**
 * Runs a command and records an undo step if it changed the scene.
 *
 * - A change that only moves the selection is not a step of its own.
 * - Changes passed the same `group` one after another become one step, with
 *   nothing else in between. A step whose changes add up to nothing is dropped.
 * - Any new step clears the redo list.
 */
export function applyCommand(history: History, command: Command, group?: string): History {
  const { present } = history;
  const next = command(present);
  if (next === present) return history;

  if (sameScene(next.scene, present.scene)) {
    if (next.selectedId === present.selectedId) return history;
    // Keep the old scene object, so the view knows nothing needs redrawing.
    return { ...history, present: { ...next, scene: present.scene }, openGroup: null };
  }

  const open = history.past[history.past.length - 1];
  if (open && group !== undefined && group === history.openGroup) {
    const earlier = history.past.slice(0, -1);
    if (sameScene(next.scene, open.before.scene)) {
      // Back where the step began (e.g. dragged out and back): drop the step.
      return { present: next, past: earlier, future: [], openGroup: null };
    }
    return { ...history, present: next, past: [...earlier, { before: open.before, after: next }], future: [] };
  }

  const past = [...history.past, { before: present, after: next }].slice(-HISTORY_LIMIT);
  return { present: next, past, future: [], openGroup: group ?? null };
}

/**
 * Ends the open group, so the next change starts a new step even if it uses
 * the same group (e.g. after moving to another frame mid-edit).
 */
export function closeGroup(history: History): History {
  return history.openGroup === null ? history : { ...history, openGroup: null };
}

/** Reverts the newest step, restoring the scene and selection from just before it. */
export function undo(history: History): History {
  const step = history.past[history.past.length - 1];
  if (!step) return history;
  return {
    present: step.before,
    past: history.past.slice(0, -1),
    future: [step, ...history.future],
    openGroup: null,
  };
}

/** Re-applies the step that was last undone, with the selection from just after it. */
export function redo(history: History): History {
  const [step, ...future] = history.future;
  if (!step) return history;
  return {
    present: step.after,
    past: [...history.past, step],
    future,
    openGroup: null,
  };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;
