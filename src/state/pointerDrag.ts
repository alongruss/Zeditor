import { createStore, useStore, type Store } from './store';

/**
 * True while a gizmo handle is dragged or the view is being turned. The
 * selection's toolbar fades out then, so it never sits under the pointer.
 */
export const pointerDrag: Store<boolean> = createStore(false);

export function setPointerDrag(dragging: boolean): void {
  pointerDrag.dispatch(() => dragging);
}

export function usePointerDrag(): boolean {
  return useStore(pointerDrag);
}
