import { useEffect, useReducer } from 'preact/hooks';
import { starterScene } from '../model/starterScene';
import { DEFAULT_FREE_VIEW, type FreeView } from '../viewport/freeView';
import type { Command, EditorState } from './commands';
import { browserStorage, readAutosave } from './autosave';
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

/**
 * The app's single store: the editor state and its undo history. It starts
 * with the autosaved scene, or the 2020 starter scene on a first visit.
 */
const tracked: Store<history.History> = createStore(
  history.startHistory({ scene: readAutosave(browserStorage()) ?? starterScene(), selectedId: null }),
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

/** Makes the next change its own undo step (e.g. after the playhead moves). */
export function closeUndoGroup(): void {
  tracked.dispatch(history.closeGroup);
}

/**
 * The free view: how you look at the scene while editing (not a scene camera).
 * Kept apart from the editor state so that turning or zooming the view is
 * never an undo step, and Undo never moves it.
 */
export const freeView: Store<FreeView> = createStore<FreeView>(DEFAULT_FREE_VIEW);

export function setFreeView(update: FreeView | ((current: FreeView) => FreeView)): void {
  freeView.dispatch(typeof update === 'function' ? update : () => update);
}

/**
 * The camera the viewport looks through, or null for the free view. Like the
 * free view, it isn't saved and isn't an undo step.
 */
export const lookThrough: Store<string | null> = createStore<string | null>(null);

export function setLookThrough(id: string | null): void {
  lookThrough.dispatch(() => id);
}

// A camera that leaves the scene (deleted, undone, or another scene opened)
// can't be looked through: go back to the free view. Otherwise a later camera
// that reuses its id would be looked through by surprise.
editor.subscribe(({ scene }) => {
  const id = lookThrough.get();
  if (id !== null && !scene.cameras.some((camera) => camera.id === id)) setLookThrough(null);
});

/** The store's current value; re-renders the calling component whenever it changes. */
export function useStore<T>(store: Store<T>): T {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const current = store.get();
  useEffect(() => {
    const unsubscribe = store.subscribe(() => forceRender(undefined));
    // Catch a change that landed between this render and subscribing.
    if (store.get() !== current) forceRender(undefined);
    return unsubscribe;
  }, [store]); // `current` is only compared on the first run
  return current;
}

/** The current editor state; re-renders the component when it changes. */
export function useEditorState(): EditorState {
  return useStore(tracked).present;
}

/** Whether Undo and Redo have anything to do; re-renders the component when that changes. */
export function useUndoAvailability(): { canUndo: boolean; canRedo: boolean } {
  const current = useStore(tracked);
  return { canUndo: history.canUndo(current), canRedo: history.canRedo(current) };
}

export function useLookThrough(): string | null {
  return useStore(lookThrough);
}

/** The current free view; re-renders the component when it changes. */
export function useFreeView(): FreeView {
  return useStore(freeView);
}
