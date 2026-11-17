import { ancestorsOf, subtreeIds } from './hierarchy';
import type { Placeable, Scene } from './types';

/**
 * Ghosts (onion skin): faint copies of the selection as posed on the keys
 * before and after the playhead, to pose against. Pure functions.
 */

/** The shapes and groups the ghosts are of: the selected ones and what's inside them (everything, with nothing selected). */
function ghostedIds(scene: Scene, selectedIds: readonly string[]): Set<string> {
  const placeables = [...scene.groups, ...scene.shapes];
  if (selectedIds.length === 0) return new Set(placeables.map((object) => object.id));
  const ids = new Set<string>();
  for (const id of selectedIds) {
    if (scene.groups.some((group) => group.id === id)) for (const inside of subtreeIds(scene, id)) ids.add(inside);
    else if (scene.shapes.some((shape) => shape.id === id)) ids.add(id);
  }
  return ids;
}

/**
 * The frames of the keys just before and just after `frame` that move the
 * ghosted objects: their own keys, and those of the groups they're in.
 */
export function ghostFrames(
  scene: Scene,
  selectedIds: readonly string[],
  frame: number,
): { readonly before?: number; readonly after?: number } {
  const ids = ghostedIds(scene, selectedIds);
  const movers = new Map<string, Placeable>();
  for (const object of [...scene.groups, ...scene.shapes]) {
    if (!ids.has(object.id)) continue;
    movers.set(object.id, object);
    for (const group of ancestorsOf(scene, object)) movers.set(group.id, group);
  }
  let before: number | undefined;
  let after: number | undefined;
  for (const object of movers.values()) {
    for (const track of Object.values(object.tracks ?? {})) {
      for (const key of track) {
        if (key.frame < frame && (before === undefined || key.frame > before)) before = key.frame;
        if (key.frame > frame && (after === undefined || key.frame < after)) after = key.frame;
      }
    }
  }
  return { before, after };
}

/** `posed` with only the ghosted shapes (groups stay, to place them; cameras go). */
export function ghostScene(posed: Scene, selectedIds: readonly string[]): Scene {
  const ids = ghostedIds(posed, selectedIds);
  return { ...posed, shapes: posed.shapes.filter((shape) => ids.has(shape.id)), cameras: [] };
}
