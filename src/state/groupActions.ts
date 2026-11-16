import { findGroup } from '../model/hierarchy';
import { groupObjects, setParent, ungroup, type GroupResult } from '../model/groups';
import { groupCommand, selectionOf, setParentCommand, ungroupCommand } from './commands';
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

/** Wraps the selected shapes and groups (not cameras) in one new group. */
export function groupSelection(): void {
  const state = editor.get();
  const ids = selectionOf(state);
  const result = groupObjects(state.scene, ids);
  if (result.scene === state.scene) return;
  run(result, groupCommand(ids));
}

/** Takes the selected groups' insides out and removes those groups. */
export function ungroupSelection(): void {
  const state = editor.get();
  const groups = selectionOf(state).filter((id) => findGroup(state.scene, id));
  if (groups.length === 0) return;
  // Kept if any of them had to keep its own values.
  let scene = state.scene;
  let kept = false;
  for (const id of groups) {
    const result = ungroup(scene, id);
    scene = result.scene;
    kept ||= result.kept;
  }
  run({ scene, id: null, kept }, ungroupCommand(groups));
}

/** Moves a shape or group into another group (null: the top level). */
export function moveToGroup(id: string, parentId: string | null): void {
  const { scene } = editor.get();
  const result = setParent(scene, id, parentId);
  if (result.scene === scene) return;
  run(result, setParentCommand(id, parentId));
}
