import { findGroup } from '../model/hierarchy';
import { deleteObjects, duplicateObjects, selectionOf } from '../state/commands';
import { groupSelection, ungroupSelection } from '../state/groupActions';
import { dispatch, editor } from '../state/store';
import { PopupMenu, type MenuPosition } from './PopupMenu';

export type { MenuPosition };

/** Right-click menu for the selection (one object or several). */
export function ContextMenu({ position, onClose }: { position: MenuPosition; onClose: () => void }) {
  const state = editor.get();
  const ids = selectionOf(state);
  // Ungroup when everything selected is a group; otherwise Group puts it all in one.
  const allGroups = ids.length > 0 && ids.every((id) => findGroup(state.scene, id));
  return (
    <PopupMenu
      label={ids.length > 1 ? `Actions for ${ids.length} selected` : 'Shape actions'}
      position={position}
      onClose={onClose}
      items={[
        { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => dispatch(duplicateObjects(editor.get().selectedIds)) },
        { label: 'Delete', shortcut: 'Del', onSelect: () => dispatch(deleteObjects(editor.get().selectedIds)) },
        allGroups
          ? { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', onSelect: ungroupSelection }
          : { label: 'Group', shortcut: 'Ctrl+G', onSelect: groupSelection },
      ]}
    />
  );
}
