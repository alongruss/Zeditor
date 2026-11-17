import { copyKeys, pasteKeys, pasteTargets, type KeyClip } from '../model/keyEdits';
import type { Command } from './commands';
import { showNotice } from './notice';
import { createStore, dispatch, editor, useStore, type Store } from './store';
import { currentFrame, pause, selectKeys, timeline } from './timeline';

/**
 * Copied keys. Kept in the editor (not the system clipboard) and not part of
 * the undo history.
 */
export const keyClipboard: Store<KeyClip | null> = createStore<KeyClip | null>(null);

export const useKeyClipboard = (): KeyClip | null => useStore(keyClipboard);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Copies the keys selected in the timeline. */
export function copySelectedKeys(): void {
  const clip = copyKeys(editor.get().scene, timeline.get().selectedKeys);
  if (!clip) return;
  keyClipboard.dispatch(() => clip);
  showNotice(`Copied ${plural(clip.count, 'key')}. Move the playhead and press Ctrl+V to paste.`);
}

/**
 * Pastes the copied keys with the first one on `frame` (the playhead by
 * default): onto `onto` if given, else onto the selected object or the keys'
 * own objects (see pasteTargets). The pasted keys are selected. One undo step.
 */
export function pasteCopiedKeys(frame = currentFrame(), onto?: string): void {
  const clip = keyClipboard.get();
  if (!clip) return;
  pause();
  const { scene, selectedIds } = editor.get();
  const targets = onto !== undefined ? new Map(clip.sources.map(({ objectId }) => [objectId, onto])) : pasteTargets(scene, clip, selectedIds);
  const result = pasteKeys(scene, clip, frame, targets);
  const command: Command = (state) => {
    const pasted = pasteKeys(state.scene, clip, frame, targets).scene;
    return pasted === state.scene ? state : { ...state, scene: pasted };
  };
  if (result.refs.length > 0) {
    dispatch(command);
    selectKeys(result.refs);
  }
  const left: string[] = [];
  if (result.pastEnd > 0) left.push(`${result.pastEnd} past the last frame`);
  if (result.unsupported > 0) left.push(`${result.unsupported} for settings it doesn't have`);
  if (left.length > 0) {
    const pasted = result.refs.length > 0 ? `Pasted ${plural(result.refs.length, 'key')}.` : 'Nothing pasted.';
    showNotice(`${pasted} Left out ${left.join(' and ')}.`);
  }
}
