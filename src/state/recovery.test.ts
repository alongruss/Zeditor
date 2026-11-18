import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findShape } from '../model/scene';
import { update } from './commands';
import { notice } from './notice';
import {
  PLAYBACK_NOTICE,
  SNAG_NOTICE,
  UNDONE_NOTICE,
  failedToDraw,
  markDrawn,
  recoverFromError,
  resetRecoveryForTests,
  stuckScene,
} from './recovery';
import { dispatch, editor, undo } from './store';
import { timeline } from './timeline';

const xOfBox = () => findShape(editor.get().scene, 'box-1')!.translate.x;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetRecoveryForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('recoverFromError', () => {
  it('steps back to the last scene that drew, says so, and never saves the one that failed', () => {
    const before = xOfBox();
    dispatch(update('box-1', { translate: { x: 3 } }));
    const good = editor.get().scene;
    markDrawn(good);
    dispatch(update('box-1', { translate: { x: 4 } }));
    dispatch(update('box-1', { translate: { x: 5 } }));
    const bad = editor.get().scene;

    expect(recoverFromError(new Error('drawing failed'))).toBe('rewound');
    expect(editor.get().scene).toBe(good);
    expect(xOfBox()).toBe(3);
    expect(notice.get()).toEqual({ text: UNDONE_NOTICE, kind: 'error' });
    expect(failedToDraw(bad)).toBe(true);
    expect(failedToDraw(good)).toBe(false);
    // Undo carries on from the good scene: the failed steps are gone.
    undo();
    expect(xOfBox()).toBe(before);
  });

  it("goes no further back when the scene it drew last fails too: it says something went wrong", () => {
    markDrawn(editor.get().scene);
    const scene = editor.get().scene;
    expect(recoverFromError(new Error('not the scene'))).toBe('nothing');
    expect(editor.get().scene).toBe(scene);
    expect(notice.get()?.text).toBe(SNAG_NOTICE);
  });

  it('stops playback when a moment of the animation fails to draw', () => {
    markDrawn(editor.get().scene);
    timeline.dispatch((state) => ({ ...state, playing: true }));
    expect(recoverFromError(new Error('frame 40'))).toBe('nothing');
    expect(timeline.get().playing).toBe(false);
    expect(notice.get()?.text).toBe(PLAYBACK_NOTICE);
  });

  it('opens the recovery dialog when nothing has drawn yet (the restored scene fails)', () => {
    expect(recoverFromError(new Error('at start-up'))).toBe('stuck');
    expect(stuckScene.get()).toBe(editor.get().scene);
    expect(failedToDraw(editor.get().scene)).toBe(true);
  });
});
