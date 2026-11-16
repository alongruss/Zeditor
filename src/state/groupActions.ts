import { findGroup } from '../model/hierarchy';
import { groupObject, setParent, ungroup, type GroupResult } from '../model/groups';
import { findShape } from '../model/scene';
import { groupCommand, setParentCommand, ungroupCommand } from './commands';
import { showNotice } from './notice';
import { dispatch, editor } from './store';

/**
 * The grouping actions the menus, toolbar, Inspector and shortcuts use: the
 * pure commands, plus a notice when an animated object had to keep its own
 * values (so it may look as if it moved).
 */

const KEPT_NOTICE =
  'Its position, rotation or scale is animated, so it kept its own values and now moves with its new group.';

function run(result: GroupResult, command: Parameters<typeof dispatch>[0]): void {
  dispatch(command);
  if (result.kept) showNotice(KEPT_NOTICE);
}

/** Wraps the selection (a shape or group) in a new group. */
export function groupSelection(): void {
  const { scene, selectedId } = editor.get();
  if (selectedId === null || !(findShape(scene, selectedId) || findGroup(scene, selectedId))) return;
  run(groupObject(scene, selectedId), groupCommand(selectedId));
}

/** Takes the selected group's insides out and removes it. */
export function ungroupSelection(): void {
  const { scene, selectedId } = editor.get();
  if (selectedId === null || !findGroup(scene, selectedId)) return;
  run(ungroup(scene, selectedId), ungroupCommand(selectedId));
}

/** Moves a shape or group into another group (null: the top level). */
export function moveToGroup(id: string, parentId: string | null): void {
  const { scene } = editor.get();
  const result = setParent(scene, id, parentId);
  if (result.scene === scene) return;
  run(result, setParentCommand(id, parentId));
}
