import { deleteObject, duplicate, type Command } from '../state/commands';
import { dispatch, editor } from '../state/store';
import { PopupMenu, type MenuPosition } from './PopupMenu';

export type { MenuPosition };

/** Right-click menu for the selected shape. */
export function ContextMenu({ position, onClose }: { position: MenuPosition; onClose: () => void }) {
  const run = (command: (id: string) => Command) => {
    const { selectedId } = editor.get();
    if (selectedId !== null) dispatch(command(selectedId));
  };
  return (
    <PopupMenu
      label="Shape actions"
      position={position}
      onClose={onClose}
      items={[
        { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => run(duplicate) },
        { label: 'Delete', shortcut: 'Del', onSelect: () => run(deleteObject) },
      ]}
    />
  );
}
