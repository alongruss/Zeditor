import type { Scene } from '../model/types';
import { showNotice } from './notice';
import { createStore, editor, rewindTo, useStore, type Store } from './store';
import { pause, timeline } from './timeline';

export const UNDONE_NOTICE = "That change couldn't be drawn, so it was undone.";
export const PLAYBACK_NOTICE = "That moment of the animation couldn't be drawn, so playback stopped.";
export const SNAG_NOTICE = "Something didn't work there, but your scene is fine. Keep going, or Undo if anything looks off.";

/** The newest scene the viewport drew without trouble. */
let lastDrawn: Scene | null = null;
/** Scenes that failed to draw: never autosaved. */
const failed = new WeakSet<Scene>();

/** The viewport drew `scene` (the editor's scene, before posing) without trouble. */
export function markDrawn(scene: Scene): void {
  lastDrawn = scene;
}

/** True for a scene that failed to draw, which mustn't be autosaved. */
export function failedToDraw(scene: Scene): boolean {
  return failed.has(scene);
}

/**
 * A scene that couldn't be drawn and has no earlier scene to go back to
 * (say, the one restored at start-up). The recovery dialog offers a way out.
 */
export const stuckScene: Store<Scene | null> = createStore<Scene | null>(null);

export function useStuckScene(): Scene | null {
  return useStore(stuckScene);
}

let lastNotice = { text: '', at: 0 };

/** Shows an error notice, but not the same one again within a few seconds. */
function tellOnce(text: string): void {
  const now = Date.now();
  if (lastNotice.text === text && now - lastNotice.at < 5000) return;
  lastNotice = { text, at: now };
  showNotice(text, 'error');
}

/** What recoverFromError did. */
export type Recovery = 'rewound' | 'stuck' | 'nothing';

/**
 * Called when drawing or a panel failed. If the scene changed since it last
 * drew, goes back to that scene and says so; at start-up, with nothing to go
 * back to, opens the recovery dialog. Otherwise (the scene drew before, so
 * the trouble is elsewhere) stops playback and says something went wrong.
 */
export function recoverFromError(error: unknown): Recovery {
  console.error('Zeditor recovered from an error:', error);
  const { scene } = editor.get();
  if (scene !== lastDrawn) failed.add(scene);
  if (lastDrawn && scene !== lastDrawn) {
    rewindTo(lastDrawn);
    tellOnce(UNDONE_NOTICE);
    return 'rewound';
  }
  if (!lastDrawn) {
    if (stuckScene.get() !== scene) stuckScene.dispatch(() => scene);
    return 'stuck';
  }
  if (timeline.get().playing) {
    pause();
    tellOnce(PLAYBACK_NOTICE);
  } else {
    tellOnce(SNAG_NOTICE);
  }
  return 'nothing';
}

/** For tests: forget what was drawn. */
export function resetRecoveryForTests(): void {
  lastDrawn = null;
  lastNotice = { text: '', at: 0 };
  stuckScene.dispatch(() => null);
}
