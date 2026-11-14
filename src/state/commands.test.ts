import { describe, expect, it } from 'vitest';
import { findShape } from '../model/scene';
import { starterScene } from '../model/starterScene';
import {
  addShapeOfType,
  deleteShape,
  duplicate,
  newScene,
  rename,
  select,
  update,
  type EditorState,
} from './commands';
import { createStore } from './store';

const initial = (): EditorState => ({ scene: starterScene(), selectedId: null });

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

describe('deleteShape', () => {
  it('removes the shape and clears the selection if it was selected', () => {
    const state = deleteShape('box-1')(select('box-1')(initial()));
    expect(findShape(state.scene, 'box-1')).toBeUndefined();
    expect(state.selectedId).toBeNull();
  });

  it('keeps another selected shape selected', () => {
    const state = deleteShape('box-1')(select('cone-1')(initial()));
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
