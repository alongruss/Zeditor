import { describe, expect, it } from 'vitest';
import { findShape } from '../model/scene';
import { starterScene } from '../model/starterScene';
import {
  addShapeOfType,
  deleteObject,
  deleteObjects,
  duplicate,
  duplicateObjects,
  editMany,
  groupCommand,
  newScene,
  rename,
  select,
  selectAll,
  selectMany,
  toggleSelect,
  ungroupCommand,
  update,
  type EditorState,
} from './commands';
import { applyCommand, startHistory, undo } from './history';
import { createStore } from './store';

const initial = (): EditorState => ({ scene: starterScene(), selectedId: null, selectedIds: [] });

describe('select', () => {
  it('selects exactly one shape at a time', () => {
    const a = select('rect-1')(initial());
    const b = select('ellipse-1')(a);
    expect(a.selectedId).toBe('rect-1');
    expect(b.selectedId).toBe('ellipse-1');
  });

  it('clears the selection for null or an unknown id', () => {
    const selected = select('rect-1')(initial());
    expect(select(null)(selected).selectedId).toBeNull();
    expect(select('nope-1')(selected).selectedId).toBeNull();
  });

  it('returns the same state when nothing changes', () => {
    const state = select('rect-1')(initial());
    expect(select('rect-1')(state)).toBe(state);
  });
});

describe('addShapeOfType', () => {
  it('adds the shape at the end and selects it', () => {
    const state = addShapeOfType('Box')(initial());
    expect(state.scene.shapes.at(-1)!.id).toBe('box-2');
    expect(state.selectedId).toBe('box-2');
  });
});

describe('deleteObject', () => {
  it('removes the shape and clears the selection if it was selected', () => {
    const state = deleteObject('box-1')(select('box-1')(initial()));
    expect(findShape(state.scene, 'box-1')).toBeUndefined();
    expect(state.selectedId).toBeNull();
  });

  it('keeps another selected shape selected', () => {
    const state = deleteObject('box-1')(select('cone-1')(initial()));
    expect(state.selectedId).toBe('cone-1');
  });
});

describe('duplicate', () => {
  it('selects the copy', () => {
    const state = duplicate('box-1')(initial());
    expect(state.selectedId).toBe('box-2');
  });
});

describe('update', () => {
  // 2020 bug: after selecting Rect then Ellipse, editing X moved both.
  it('edits only the shape it names, regardless of earlier selections', () => {
    let state = select('rect-1')(initial());
    state = select('ellipse-1')(state);
    state = update('ellipse-1', { translate: { x: 9 } })(state);
    expect(findShape(state.scene, 'ellipse-1')!.translate.x).toBe(9);
    expect(findShape(state.scene, 'rect-1')!.translate.x).toBe(-4);
  });
});

describe('rename', () => {
  it('trims the new name', () => {
    const state = rename('box-1', '  Crate  ')(initial());
    expect(findShape(state.scene, 'box-1')!.name).toBe('Crate');
  });

  it('ignores an empty name', () => {
    const state = initial();
    expect(rename('box-1', '   ')(state)).toBe(state);
  });
});

describe('newScene', () => {
  it('empties the scene and clears the selection', () => {
    const state = newScene(select('box-1')(initial()));
    expect(state.scene.shapes).toEqual([]);
    expect(state.selectedId).toBeNull();
  });
});

describe('createStore', () => {
  it('notifies subscribers only when the state changes', () => {
    const store = createStore(initial());
    const seen: (string | null)[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.selectedId));
    store.dispatch(select('box-1'));
    store.dispatch(select('box-1'));
    store.dispatch(select(null));
    unsubscribe();
    store.dispatch(select('cone-1'));
    expect(seen).toEqual(['box-1', null]);
    expect(store.get().selectedId).toBe('cone-1');
  });
});

describe('selecting several', () => {
  it('Ctrl-click adds and takes out; the last one picked is the one shown', () => {
    let state = select('box-1')(initial());
    state = toggleSelect('cone-1')(state);
    expect(state.selectedIds).toEqual(['box-1', 'cone-1']);
    expect(state.selectedId).toBe('cone-1');
    state = toggleSelect('cone-1')(state);
    expect(state.selectedIds).toEqual(['box-1']);
    expect(state.selectedId).toBe('box-1');
    expect(toggleSelect('nope-1')(state)).toBe(state);
    // A plain select goes back to one.
    expect(select('rect-1')(toggleSelect('cone-1')(state)).selectedIds).toEqual(['rect-1']);
  });

  it('selects a range, ignoring ids that are gone, and selects all', () => {
    const state = selectMany(['box-1', 'nope', 'cone-1', 'box-1'])(initial());
    expect(state.selectedIds).toEqual(['box-1', 'cone-1']);
    expect(selectMany(['box-1', 'cone-1'])(state)).toBe(state);
    const all = selectAll(initial());
    expect(all.selectedIds).toHaveLength(all.scene.shapes.length + all.scene.groups.filter((g) => !g.parent).length + all.scene.cameras.length);
  });

  it('deletes and duplicates them all; copies end up selected', () => {
    const state = selectMany(['box-1', 'cone-1'])(initial());
    const gone = deleteObjects(state.selectedIds)(state);
    expect(findShape(gone.scene, 'box-1')).toBeUndefined();
    expect(findShape(gone.scene, 'cone-1')).toBeUndefined();
    expect(gone.selectedIds).toEqual([]);
    const copied = duplicateObjects(state.selectedIds)(state);
    expect(copied.scene.shapes).toHaveLength(state.scene.shapes.length + 2);
    expect(copied.selectedIds).toEqual(['box-2', 'cone-2']);
  });

  it('groups them into one group, and ungrouping selects what was inside', () => {
    const state = selectMany(['box-1', 'cone-1'])(initial());
    const grouped = groupCommand(state.selectedIds)(state);
    expect(grouped.scene.groups).toHaveLength(1);
    expect(grouped.selectedIds).toEqual([grouped.scene.groups[0].id]);
    const ungrouped = ungroupCommand(grouped.selectedIds)(grouped);
    expect(ungrouped.scene.groups).toHaveLength(0);
    expect([...ungrouped.selectedIds].sort()).toEqual(['box-1', 'cone-1']);
  });

  it('moves several in one change, and one undo step brings them back', () => {
    const start = selectMany(['box-1', 'cone-1'])(initial());
    const at = (id: string) => findShape(start.scene, id)!.translate;
    const moved = applyCommand(
      startHistory(start),
      editMany(
        [
          { id: 'box-1', patch: { translate: { ...at('box-1'), x: at('box-1').x + 2 } } },
          { id: 'cone-1', patch: { translate: { ...at('cone-1'), x: at('cone-1').x + 2 } } },
        ],
        0,
      ),
    );
    expect(findShape(moved.present.scene, 'box-1')!.translate.x).toBe(at('box-1').x + 2);
    expect(findShape(moved.present.scene, 'cone-1')!.translate.x).toBe(at('cone-1').x + 2);
    expect(moved.past).toHaveLength(1);
    const back = undo(moved);
    expect(back.present.scene).toBe(start.scene);
    expect(back.present.selectedIds).toEqual(['box-1', 'cone-1']);
  });
});
