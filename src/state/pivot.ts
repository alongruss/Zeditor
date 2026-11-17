import { createStore, useStore, type Store } from './store';

/**
 * The group whose pivot the gizmo moves (its Pivot button is on), or null.
 * A view setting: not saved, not undone. Selecting something else leaves it
 * off for that; coming back to the group finds it as it was.
 */
export const pivotGroup: Store<string | null> = createStore<string | null>(null);

export const usePivotGroup = (): string | null => useStore(pivotGroup);

export function setPivotGroup(id: string | null): void {
  pivotGroup.dispatch((current) => (current === id ? current : id));
}
