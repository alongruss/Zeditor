import { describe, expect, it } from 'vitest';
import { starterScene } from '../model/starterScene';
import type { EditorState } from './commands';
import { shortcutFor, type KeyPress } from './shortcuts';

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

const state: EditorState = { scene: starterScene(), selectedId: 'box-1', selectedIds: ['box-1'] };
const run = (keyPress: KeyPress, selectedIds: readonly string[] = ['box-1']) => {
  const shortcut = shortcutFor(keyPress, selectedIds);
  if (typeof shortcut !== 'function') throw new Error(`expected a command, got ${String(shortcut)}`);
  return shortcut({ ...state, selectedId: selectedIds[selectedIds.length - 1] ?? null, selectedIds });
};

describe('shortcutFor', () => {
  it('deletes the selected shape with Delete or Backspace', () => {
    expect(run(press('Delete')).scene.shapes).toHaveLength(8);
    expect(run(press('Backspace')).scene.shapes).toHaveLength(8);
  });

  it('deletes and duplicates everything selected', () => {
    expect(run(press('Delete'), ['box-1', 'cone-1']).scene.shapes).toHaveLength(7);
    const copied = run(press('d', { ctrlKey: true }), ['box-1', 'cone-1']);
    expect(copied.scene.shapes).toHaveLength(11);
    expect(copied.selectedIds).toEqual(['box-2', 'cone-2']);
  });

  it('selects everything with Ctrl+A', () => {
    const all = run(press('a', { ctrlKey: true }), []);
    expect(all.selectedIds).toHaveLength(9 + state.scene.cameras.length);
  });

  it('duplicates with Ctrl+D or Cmd+D', () => {
    expect(run(press('d', { ctrlKey: true })).selectedId).toBe('box-2');
    expect(run(press('D', { metaKey: true })).selectedId).toBe('box-2');
  });

  it('claims Ctrl+D without a selection, so the browser does not bookmark the page', () => {
    const empty = { ...state, selectedId: null, selectedIds: [] };
    const shortcut = shortcutFor(press('d', { ctrlKey: true }), null);
    expect(typeof shortcut).toBe('function');
    expect((shortcut as (s: EditorState) => EditorState)(empty)).toBe(empty);
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac)', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }), null)).toBe('undo');
    expect(shortcutFor(press('z', { metaKey: true }), 'box-1')).toBe('undo');
    expect(shortcutFor(press('Z', { ctrlKey: true, shiftKey: true }), null)).toBe('redo');
    expect(shortcutFor(press('Z', { metaKey: true, shiftKey: true }), null)).toBe('redo');
    expect(shortcutFor(press('y', { ctrlKey: true }), null)).toBe('redo');
  });

  it('saves with Ctrl+S and opens with Ctrl+O, instead of the browser', () => {
    expect(shortcutFor(press('s', { ctrlKey: true }), null)).toBe('save');
    expect(shortcutFor(press('s', { metaKey: true }), 'box-1')).toBe('save');
    expect(shortcutFor(press('o', { ctrlKey: true }), null)).toBe('open');
    expect(shortcutFor(press('S', { ctrlKey: true, shiftKey: true }), null)).toBeNull();
  });

  it('plays with Space, and steps or jumps the playhead with the arrows, Home and End', () => {
    expect(shortcutFor(press(' '), null)).toBe('togglePlay');
    expect(shortcutFor(press('ArrowLeft'), null)).toEqual({ stepFrames: -1 });
    expect(shortcutFor(press('ArrowRight', { shiftKey: true }), 'box-1')).toEqual({ stepFrames: 10 });
    expect(shortcutFor(press('Home'), null)).toBe('firstFrame');
    expect(shortcutFor(press('End'), null)).toBe('lastFrame');
    expect(shortcutFor(press(' ', { ctrlKey: true }), null)).toBeNull();
  });

  it('deletes the selected keys instead of the shape when keys are selected', () => {
    expect(shortcutFor(press('Delete'), 'box-1', true)).toBe('deleteKeys');
    expect(shortcutFor(press('Backspace'), null, true)).toBe('deleteKeys');
    expect(typeof shortcutFor(press('Delete'), 'box-1', false)).toBe('function');
  });

  it('finds Ctrl+Z and Ctrl+D by physical key on non-Latin layouts', () => {
    // Hebrew layout: the Z key types "ז" and the D key types "ג".
    expect(shortcutFor(press('ז', { code: 'KeyZ', ctrlKey: true }), null)).toBe('undo');
    expect(shortcutFor(press('ז', { code: 'KeyZ', ctrlKey: true, shiftKey: true }), null)).toBe('redo');
    expect(run(press('ג', { code: 'KeyD', ctrlKey: true })).selectedId).toBe('box-2');
    // A Latin key wins over its position (AZERTY: the key labelled Z sits at KeyW).
    expect(shortcutFor(press('z', { code: 'KeyW', ctrlKey: true }), null)).toBe('undo');
  });

  it('clears the selection with Escape', () => {
    expect(run(press('Escape')).selectedId).toBeNull();
  });

  it('does nothing without a selection', () => {
    expect(shortcutFor(press('Delete'), null)).toBeNull();
    expect(shortcutFor(press('Escape'), null)).toBeNull();
  });

  it('ignores other keys and modified variants', () => {
    expect(shortcutFor(press('d'), 'box-1')).toBeNull();
    expect(shortcutFor(press('z'), 'box-1')).toBeNull();
    expect(shortcutFor(press('d', { ctrlKey: true, shiftKey: true }), 'box-1')).toBeNull();
    expect(shortcutFor(press('z', { ctrlKey: true, altKey: true }), 'box-1')).toBeNull();
    expect(shortcutFor(press('y', { ctrlKey: true, shiftKey: true }), 'box-1')).toBeNull();
    expect(shortcutFor(press('Delete', { ctrlKey: true }), 'box-1')).toBeNull();
    expect(shortcutFor(press('b', { ctrlKey: true }), 'box-1')).toBeNull();
  });
});

describe('copying and pasting keys', () => {
  it('Ctrl+C copies selected keys and Ctrl+V pastes copied ones; otherwise the browser keeps them', () => {
    expect(shortcutFor(press('c', { ctrlKey: true }), 'box-1', true)).toBe('copyKeys');
    expect(shortcutFor(press('c', { ctrlKey: true }), 'box-1', false)).toBeNull();
    expect(shortcutFor(press('v', { metaKey: true }), null, false, true)).toBe('pasteKeys');
    expect(shortcutFor(press('v', { ctrlKey: true }), null, true, false)).toBeNull();
  });
});
