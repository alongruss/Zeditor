import { ancestorsOf, childrenOf, commonParent, depthOf, findGroup, MAX_DEPTH, subtreeIds, topmost, worldTransform } from './hierarchy';
import { createGroup, findShape, replaceObjects } from './scene';
import { compose, IDENTITY, relativeTo, type Transform } from './transform';
import type { GroupData, Placeable, Scene, SceneObject } from './types';

/**
 * Putting shapes and groups into groups and taking them out. Each keeps its
 * place in the world: its own position, rotation and scale are worked out
 * again for its new parent. Animated transforms can't be re-expressed key
 * by key, so an object whose position, rotation or scale is animated keeps
 * its own values instead (and moves with its new parent); `kept` says so.
 */

export interface GroupResult {
  readonly scene: Scene;
  /** The object to select afterwards. */
  readonly id: string | null;
  /** True if an animated object kept its own values (so it may have moved). */
  readonly kept: boolean;
}

const TRANSFORM_PATH = /^(translate|rotate)\.|^scale$/;

export function hasAnimatedTransform(object: SceneObject): boolean {
  return Object.keys(object.tracks ?? {}).some((path) => TRANSFORM_PATH.test(path));
}

const transformOf = (object: Placeable): Transform => ({
  translate: object.translate,
  rotate: object.rotate,
  scale: object.scale,
});

function withTransform<T extends Placeable>(object: T, transform: Transform): T {
  return { ...object, translate: transform.translate, rotate: transform.rotate, scale: transform.scale };
}

function withParent<T extends Placeable>(object: T, parent: string | undefined): T {
  const next = { ...object };
  if (parent === undefined) delete (next as { parent?: string }).parent;
  else (next as { parent?: string }).parent = parent;
  return next;
}

function placeable(scene: Scene, id: string): Placeable | undefined {
  return findShape(scene, id) ?? findGroup(scene, id);
}

/**
 * Wraps a shape or group in a new group, in its place. The group sits at
 * the object's position (or at its parent's origin, if the object's
 * position is animated), so the object doesn't move.
 */
export function groupObject(scene: Scene, id: string): GroupResult {
  const object = placeable(scene, id);
  if (!object || depthOf(scene, object) + 1 >= MAX_DEPTH) return { scene, id: null, kept: false };
  const animated = hasAnimatedTransform(object);
  const group = createGroup(scene, {
    translate: animated ? { x: 0, y: 0, z: 0 } : { ...object.translate },
    ...(object.parent !== undefined ? { parent: object.parent } : {}),
  });
  const moved = withParent(animated ? object : { ...object, translate: { x: 0, y: 0, z: 0 } }, group.id);
  // The new group goes where the object was among its parent's groups (or last).
  const groups = [...scene.groups];
  const at = object.type === 'Group' ? groups.findIndex((g) => g.id === object.id) : groups.length;
  groups.splice(at, 0, group);
  const next = replaceObjects({ ...scene, groups }, new Map([[object.id, moved]]));
  return { scene: next, id: group.id, kept: false };
}

/**
 * Wraps several shapes and groups in one new group, each keeping its place
 * in the world. The group goes in the nearest group that holds them all,
 * at their middle (so it turns and scales around them), or at that group's
 * origin if any of them is animated. Objects inside another chosen group go
 * with that group. One object: see groupObject. Refused (scene unchanged)
 * if nothing can be grouped or it would nest too deep.
 */
export function groupObjects(scene: Scene, ids: readonly string[]): GroupResult {
  const objects = topmost(scene, ids)
    .map((id) => placeable(scene, id))
    .filter((object): object is Placeable => object !== undefined);
  if (objects.length === 0) return { scene, id: null, kept: false };
  if (objects.length === 1) return groupObject(scene, objects[0].id);

  const parent = commonParent(scene, objects);
  const parentDepth = parent ? depthOf(scene, parent) + 1 : 0;
  const deepest = Math.max(...objects.map((o) => (o.type === 'Group' ? maxDepthBelow(scene, o.id) : 0)));
  if (parentDepth + 1 + deepest >= MAX_DEPTH) return { scene, id: null, kept: false };

  const parentWorld = parent ? worldTransform(scene, parent) : IDENTITY;
  const animated = objects.some(hasAnimatedTransform);
  let center = { x: 0, y: 0, z: 0 };
  if (!animated) {
    const local = objects.map((o) => relativeTo(parentWorld, worldTransform(scene, o)).translate);
    const mean = (axis: 'x' | 'y' | 'z') => Math.round((local.reduce((sum, t) => sum + t[axis], 0) / local.length) * 1000) / 1000;
    center = { x: mean('x'), y: mean('y'), z: mean('z') };
  }
  const group = createGroup(scene, { translate: center, ...(parent ? { parent: parent.id } : {}) });
  const groupWorld = compose(parentWorld, { translate: center, rotate: { x: 0, y: 0, z: 0 }, scale: 1 });

  let kept = false;
  const changed = new Map<string, SceneObject>();
  for (const object of objects) {
    let moved = withParent(object, group.id);
    if (!hasAnimatedTransform(object)) moved = withTransform(moved, relativeTo(groupWorld, worldTransform(scene, object)));
    else if ((object.parent ?? undefined) !== parent?.id) kept = true; // its keys are in its old group's space
    changed.set(object.id, moved);
  }
  // The new group goes where the first chosen group was among the groups (or last).
  const groups = [...scene.groups];
  const firstGroup = groups.findIndex((g) => changed.has(g.id));
  groups.splice(firstGroup === -1 ? groups.length : firstGroup, 0, group);
  return { scene: replaceObjects({ ...scene, groups }, changed), id: group.id, kept };
}

/**
 * Moves an object into another group (or to the top level with null),
 * keeping its place in the world. Refused (scene unchanged) if a group
 * would end up inside itself, or nested too deep.
 */
export function setParent(scene: Scene, id: string, parentId: string | null): GroupResult {
  const object = placeable(scene, id);
  const parent = parentId === null ? undefined : findGroup(scene, parentId);
  if (!object || (parentId !== null && !parent)) return { scene, id: null, kept: false };
  if ((object.parent ?? null) === parentId) return { scene, id, kept: false };
  if (parent && object.type === 'Group' && subtreeIds(scene, object.id).has(parent.id)) return { scene, id: null, kept: false };
  const subtreeDepth = object.type === 'Group' ? maxDepthBelow(scene, object.id) : 0;
  if (parent && depthOf(scene, parent) + 1 + subtreeDepth >= MAX_DEPTH) return { scene, id: null, kept: false };

  const animated = hasAnimatedTransform(object);
  let moved = withParent(object, parentId ?? undefined);
  if (!animated) {
    const newParent = parent ? worldTransform(scene, parent) : IDENTITY;
    moved = withTransform(moved, relativeTo(newParent, worldTransform(scene, object)));
  }
  return { scene: replaceObjects(scene, new Map([[object.id, moved]])), id, kept: animated };
}

/** How many levels of groups sit below a group (0 if it holds only shapes, or nothing). */
function maxDepthBelow(scene: Scene, groupId: string): number {
  const below = scene.groups.filter((g) => g.id !== groupId && subtreeIds(scene, groupId).has(g.id));
  const root = findGroup(scene, groupId);
  if (!root) return 0;
  const base = ancestorsOf(scene, root).length;
  return below.reduce((most, g) => Math.max(most, ancestorsOf(scene, g).length - base), 0);
}

/**
 * Takes a group's insides out into its parent and removes the group. Each
 * child keeps its place in the world (unless the group or the child is
 * animated: then the child keeps its own values).
 */
export function ungroup(scene: Scene, groupId: string): GroupResult {
  const group = findGroup(scene, groupId);
  if (!group) return { scene, id: null, kept: false };
  const groupAnimated = hasAnimatedTransform(group);
  let kept = false;
  const changed = new Map<string, SceneObject>();
  for (const child of childrenOf(scene, group.id)) {
    let next = withParent(child, group.parent);
    if (groupAnimated || hasAnimatedTransform(child)) kept = true;
    else next = withTransform(next, compose(transformOf(group), transformOf(child)));
    changed.set(child.id, next);
  }
  const withoutGroup = { ...scene, groups: scene.groups.filter((g) => g.id !== group.id) };
  const firstChild = childrenOf(scene, group.id)[0];
  return { scene: replaceObjects(withoutGroup, changed), id: firstChild?.id ?? null, kept };
}

export type { GroupData };
