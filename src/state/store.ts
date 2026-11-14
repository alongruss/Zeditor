import { useEffect, useReducer } from 'preact/hooks';
import { starterScene } from '../model/starterScene';
import type { Command, EditorState } from './commands';

export interface Store<T> {
  get(): T;
  /** Applies a command; listeners run only if the state actually changed. */
  dispatch(command: (state: T) => T): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();
  return {
    get: () => state,
    dispatch(command) {
      const next = command(state);
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

/** The app's single editor store. */
export const editor: Store<EditorState> = createStore<EditorState>({
  scene: starterScene(),
  selectedId: null,
});

export const dispatch = (command: Command): void => editor.dispatch(command);

/** Re-renders the calling component whenever the editor state changes. */
export function useEditorState(): EditorState {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const state = editor.get();
  useEffect(() => {
    const unsubscribe = editor.subscribe(() => forceRender(undefined));
    // Catch a change that landed between this render and subscribing.
    if (editor.get() !== state) forceRender(undefined);
    return unsubscribe;
  }, []); // subscribe once; `state` is only compared on the first run
  return state;
}
