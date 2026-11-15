import { isAnimated } from '../model/evaluate';
import { allObjects } from '../model/scene';
import type { Scene } from '../model/types';
import { browserStorage } from './autosave';
import { showNotice } from './notice';
import { editor } from './store';
import { setPanelOpen } from './timeline';

export const FIRST_KEY_TIP = 'Move to another frame and change something to animate it.';
const SHOWN_KEY = 'zeditor.firstKeyTipShown';

type TipStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Same objects (by id): the change was an edit, not a different scene being opened. */
function sameObjects(a: Scene, b: Scene): boolean {
  const ids = (scene: Scene) => allObjects(scene).map((object) => object.id).sort().join('\n');
  return ids(a) === ids(b);
}

/** True when this browser has shown the tip before. Blocked storage counts as no. */
function wasShown(storage: TipStorage | null): boolean {
  try {
    return storage?.getItem(SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function markShown(storage: TipStorage | null): void {
  try {
    storage?.setItem(SHOWN_KEY, '1');
  } catch {
    // Storage blocked: the tip may show again next time, which is harmless.
  }
}

/**
 * The first time a scene gets its first key (in this browser), open the
 * timeline and say what to do next, once, as a plain notice.
 */
export function startFirstKeyTip(storage: TipStorage | null = browserStorage()): () => void {
  let previous = editor.get().scene;
  return editor.subscribe(({ scene }) => {
    const before = previous;
    previous = scene;
    if (before === scene || isAnimated(before) || !isAnimated(scene)) return;
    if (!sameObjects(before, scene) || wasShown(storage)) return;
    markShown(storage);
    setPanelOpen(true);
    showNotice(FIRST_KEY_TIP);
  });
}
