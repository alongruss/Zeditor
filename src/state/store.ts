import { useEffect, useReducer } from 'preact/hooks';
import { starterScene } from '../model/starterScene';
import type { Command, EditorState } from './commands';
import * as history from './history';

export interface Store<T> {
  get(): T;
  /** Applies an update; listeners run only if the state actually changed. */
  dispatch(update: (state: T) => T): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();
  return {
    get: () => state,
    dispatch(update) {
      const next = update(state);
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app's single store: the editor state and its undo history. */
const tracked: Store<history.History> = createStore(
  history.startHistory({ scene: starterScene(), selectedId: null }),
);

/** Read-only view of the current editor state, for code outside components. */
export const editor = {
  get: (): EditorState => tracked.get().present,
  subscribe: (listener: (state: EditorState) => void): (() => void) =>
    tracked.subscribe((current) => listener(current.present)),
};

export interface DispatchOptions {
  /**
   * Changes dispatched with the same group, one after another, undo as one
   * step. Use `newGroup()` once per drag or per visit to a text field.
   */
  readonly group?: string;
}

/** Runs a command. If it changes the scene, that change can be undone. */
export function dispatch(command: Command, options: DispatchOptions = {}): void {
  tracked.dispatch((current) => history.applyCommand(current, command, options.group));
}

export function undo(): void {
  tracked.dispatch(history.undo);
}

export function redo(): void {
  tracked.dispatch(history.redo);
}

/** Re-renders the calling component whenever the store changes. */
function useTracked(): history.History {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const current = tracked.get();
  useEffect(() => {
    const unsubscribe = tracked.subscribe(() => forceRender(undefined));
    // Catch a change that landed between this render and subscribing.
    if (tracked.get() !== current) forceRender(undefined);
    return unsubscribe;
  }, []); // subscribe once; `current` is only compared on the first run
  return current;
}

/** The current editor state; re-renders the component when it changes. */
export function useEditorState(): EditorState {
  return useTracked().present;
}

/** Whether Undo and Redo have anything to do; re-renders the component when that changes. */
export function useUndoAvailability(): { canUndo: boolean; canRedo: boolean } {
  const current = useTracked();
  return { canUndo: history.canUndo(current), canRedo: history.canRedo(current) };
}
