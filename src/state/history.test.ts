import { describe, expect, it } from 'vitest';
import { findShape } from '../model/scene';
import { starterScene } from '../model/starterScene';
import { addShapeOfType, deleteShape, newScene, rename, select, update, type EditorState } from './commands';
import {
  HISTORY_LIMIT,
  applyCommand,
  canRedo,
  closeGroup,
  canUndo,
  newGroup,
  redo,
  startHistory,
  undo,
  type History,
} from './history';

const start = (): History => startHistory({ scene: starterScene(), selectedId: null });
const xOf = (state: EditorState, id: string) => findShape(state.scene, id)!.translate.x;
const moveX = (id: string, x: number) => update(id, { translate: { x } });

describe('applyCommand', () => {
  it('records a step for each change to the scene', () => {
    let history = start();
    history = applyCommand(history, moveX('box-1', 1));
    history = applyCommand(history, moveX('box-1', 2));
    expect(history.past).toHaveLength(2);
    expect(xOf(history.present, 'box-1')).toBe(2);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);
  });

  it('does not record selection changes as steps', () => {
    let history = start();
    history = applyCommand(history, select('box-1'));
    history = applyCommand(history, select('cone-1'));
    expect(history.present.selectedId).toBe('cone-1');
    expect(canUndo(history)).toBe(false);
  });

  it('ignores commands that change nothing', () => {
    const history = start();
    expect(applyCommand(history, rename('box-1', 'Box 1'))).toBe(history);
    expect(applyCommand(history, moveX('box-1', 4))).toBe(history); // already at x = 4
    expect(applyCommand(history, select(null))).toBe(history);
  });

  it('merges changes with the same group into one step', () => {
    const drag = newGroup();
    let history = start();
    for (const x of [5, 6, 7, 8]) history = applyCommand(history, moveX('box-1', x), drag);
    expect(history.past).toHaveLength(1);
    expect(xOf(history.present, 'box-1')).toBe(8);
    expect(xOf(undo(history).present, 'box-1')).toBe(4);
  });

  it('starts a new step when another group or an ungrouped change comes between', () => {
    const typing = newGroup();
    let history = start();
    history = applyCommand(history, moveX('box-1', 5), typing);
    history = applyCommand(history, rename('box-1', 'Crate'));
    history = applyCommand(history, moveX('box-1', 6), typing);
    expect(history.past).toHaveLength(3);

    history = applyCommand(history, moveX('box-1', 7), newGroup());
    expect(history.past).toHaveLength(4);
  });

  it('starts a new step after a selection change, even in the same group', () => {
    const group = newGroup();
    let history = start();
    history = applyCommand(history, moveX('box-1', 5), group);
    history = applyCommand(history, select('box-1'));
    history = applyCommand(history, moveX('box-1', 6), group);
    expect(history.past).toHaveLength(2);
  });

  it('drops a grouped step that ends where it began', () => {
    const drag = newGroup();
    let history = applyCommand(start(), moveX('cone-1', 1));
    history = applyCommand(history, moveX('box-1', 5), drag);
    history = applyCommand(history, moveX('box-1', 4), drag); // dragged back to the start
    expect(history.past).toHaveLength(1);
    expect(xOf(undo(history).present, 'cone-1')).toBe(12);

    // Dragging on again after that is a fresh step from the original value.
    history = applyCommand(history, moveX('box-1', 9), drag);
    expect(history.past).toHaveLength(2);
    expect(xOf(undo(history).present, 'box-1')).toBe(4);
  });

  it('keeps at most HISTORY_LIMIT steps, dropping the oldest', () => {
    let history = start();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) history = applyCommand(history, moveX('box-1', 100 + i));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    while (canUndo(history)) history = undo(history);
    expect(xOf(history.present, 'box-1')).toBe(105);
  });

  it('clears the redo list when a new change is made', () => {
    let history = applyCommand(start(), moveX('box-1', 5));
    history = undo(history);
    expect(canRedo(history)).toBe(true);
    history = applyCommand(history, moveX('cone-1', 0));
    expect(canRedo(history)).toBe(false);
  });
});

describe('undo and redo', () => {
  it('step back and forward through changes', () => {
    let history = start();
    history = applyCommand(history, moveX('box-1', 5));
    history = applyCommand(history, moveX('box-1', 6));

    history = undo(history);
    expect(xOf(history.present, 'box-1')).toBe(5);
    history = undo(history);
    expect(xOf(history.present, 'box-1')).toBe(4);
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);

    history = redo(history);
    history = redo(history);
    expect(xOf(history.present, 'box-1')).toBe(6);
    expect(canRedo(history)).toBe(false);
    expect(redo(history)).toBe(history);
  });

  it('bring a deleted shape back, selected', () => {
    let history = applyCommand(start(), select('box-1'));
    history = applyCommand(history, deleteShape('box-1'));
    expect(history.present.selectedId).toBeNull();

    history = undo(history);
    expect(findShape(history.present.scene, 'box-1')).toBeDefined();
    expect(history.present.selectedId).toBe('box-1');

    history = redo(history);
    expect(findShape(history.present.scene, 'box-1')).toBeUndefined();
    expect(history.present.selectedId).toBeNull();
  });

  it('select the shape that changed, even if the selection moved on since', () => {
    let history = applyCommand(start(), select('box-1'));
    history = applyCommand(history, moveX('box-1', 5));
    history = applyCommand(history, select('cone-1'));
    history = undo(history);
    expect(history.present.selectedId).toBe('box-1');

    history = applyCommand(history, select(null));
    history = redo(history);
    expect(history.present.selectedId).toBe('box-1');
    expect(xOf(history.present, 'box-1')).toBe(5);
  });

  it('redo a whole group to its last value', () => {
    const drag = newGroup();
    let history = start();
    for (const x of [5, 6, 7]) history = applyCommand(history, moveX('box-1', x), drag);
    history = redo(undo(history));
    expect(xOf(history.present, 'box-1')).toBe(7);
  });

  it('undo a new shape and a whole new scene', () => {
    let history = applyCommand(start(), addShapeOfType('Box'));
    expect(history.present.selectedId).toBe('box-2');
    history = applyCommand(history, newScene);
    expect(history.present.scene.shapes).toHaveLength(0);

    history = undo(history);
    expect(history.present.scene.shapes).toHaveLength(10);
    history = undo(history);
    expect(history.present.scene.shapes).toHaveLength(9);
    expect(findShape(history.present.scene, 'box-2')).toBeUndefined();
  });

  it('close the open group, so later changes in it are a new step', () => {
    const typing = newGroup();
    let history = applyCommand(start(), moveX('box-1', 5), typing);
    history = redo(undo(history));
    history = applyCommand(history, moveX('box-1', 6), typing);
    expect(history.past).toHaveLength(2);
  });
});

describe('closeGroup', () => {
  it('makes the next change in the same group a step of its own', () => {
    const typing = newGroup();
    let history = applyCommand(start(), moveX('box-1', 5), typing);
    history = closeGroup(history);
    history = applyCommand(history, moveX('box-1', 6), typing);
    expect(history.past).toHaveLength(2);
    expect(closeGroup(start())).toEqual(start());
  });
});
