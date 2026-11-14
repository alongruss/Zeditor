import { describe, expect, it } from 'vitest';
import { starterScene } from '../model/starterScene';
import type { EditorState } from './commands';
import { shortcutCommand, type KeyPress } from './shortcuts';

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

const state: EditorState = { scene: starterScene(), selectedId: 'box-1' };
const run = (keyPress: KeyPress, selectedId: string | null = 'box-1') =>
  shortcutCommand(keyPress, selectedId)?.({ ...state, selectedId });

describe('shortcutCommand', () => {
  it('deletes the selected shape with Delete or Backspace', () => {
    expect(run(press('Delete'))!.scene.shapes).toHaveLength(8);
    expect(run(press('Backspace'))!.scene.shapes).toHaveLength(8);
  });

  it('duplicates with Ctrl+D or Cmd+D', () => {
    expect(run(press('d', { ctrlKey: true }))!.selectedId).toBe('box-2');
    expect(run(press('D', { metaKey: true }))!.selectedId).toBe('box-2');
  });

  it('clears the selection with Escape', () => {
    expect(run(press('Escape'))!.selectedId).toBeNull();
  });

  it('does nothing without a selection', () => {
    expect(shortcutCommand(press('Delete'), null)).toBeNull();
    expect(shortcutCommand(press('d', { ctrlKey: true }), null)).toBeNull();
    expect(shortcutCommand(press('Escape'), null)).toBeNull();
  });

  it('ignores other keys and modified variants', () => {
    expect(shortcutCommand(press('d'), 'box-1')).toBeNull();
    expect(shortcutCommand(press('d', { ctrlKey: true, shiftKey: true }), 'box-1')).toBeNull();
    expect(shortcutCommand(press('Delete', { ctrlKey: true }), 'box-1')).toBeNull();
    expect(shortcutCommand(press('a'), 'box-1')).toBeNull();
  });
});
