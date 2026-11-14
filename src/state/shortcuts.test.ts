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

const state: EditorState = { scene: starterScene(), selectedId: 'box-1' };
const run = (keyPress: KeyPress, selectedId: string | null = 'box-1') => {
  const shortcut = shortcutFor(keyPress, selectedId);
  if (typeof shortcut !== 'function') throw new Error(`expected a command, got ${String(shortcut)}`);
  return shortcut({ ...state, selectedId });
};

describe('shortcutFor', () => {
  it('deletes the selected shape with Delete or Backspace', () => {
    expect(run(press('Delete')).scene.shapes).toHaveLength(8);
    expect(run(press('Backspace')).scene.shapes).toHaveLength(8);
  });

  it('duplicates with Ctrl+D or Cmd+D', () => {
    expect(run(press('d', { ctrlKey: true })).selectedId).toBe('box-2');
    expect(run(press('D', { metaKey: true })).selectedId).toBe('box-2');
  });

  it('claims Ctrl+D without a selection, so the browser does not bookmark the page', () => {
    const empty = { ...state, selectedId: null };
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
    expect(shortcutFor(press('a', { ctrlKey: true }), 'box-1')).toBeNull();
  });
});
