import { compose, IDENTITY, type Transform } from './transform';
import type { GroupData, Placeable, Scene } from './types';

/**
 * Groups and what is inside them. Shapes and groups name their group in
 * `parent`; a parent's children are its groups (in scene order), then its
 * shapes (in theirs). Cameras are never inside groups.
 */

/** Deepest nesting allowed (files are refused past it, and grouping stops there). */
export const MAX_DEPTH = 32;

export function findGroup(scene: Scene, id: string | null | undefined): GroupData | undefined {
  return id == null ? undefined : scene.groups.find((group) => group.id === id);
}

/** The shapes and groups directly inside `parent` (null: at the top level), in drawing order. */
export function childrenOf(scene: Scene, parent: string | null): Placeable[] {
  const inside = (object: Placeable) => (object.parent ?? null) === parent;
  return [...scene.groups.filter(inside), ...scene.shapes.filter(inside)];
}

/** The groups around an object, nearest first. Stops at a missing group or a loop. */
export function ancestorsOf(scene: Scene, object: Placeable): GroupData[] {
  const found: GroupData[] = [];
  const seen = new Set<string>([object.id]);
  let parent = findGroup(scene, object.parent);
  while (parent && !seen.has(parent.id) && found.length < MAX_DEPTH) {
    found.push(parent);
    seen.add(parent.id);
    parent = findGroup(scene, parent.parent);
  }
  return found;
}

/** A group and everything inside it, at any depth (ids). */
export function subtreeIds(scene: Scene, groupId: string): Set<string> {
  const ids = new Set<string>([groupId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of [...scene.groups, ...scene.shapes]) {
      if (object.parent !== undefined && ids.has(object.parent) && !ids.has(object.id)) {
        ids.add(object.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** How deep an object sits: 0 at the top level. */
export function depthOf(scene: Scene, object: Placeable): number {
  return ancestorsOf(scene, object).length;
}

const transformOf = (object: Placeable): Transform => ({
  translate: object.translate,
  rotate: object.rotate,
  scale: object.scale,
});

/** Where an object's parent puts things: its groups' transforms composed (identity at the top). */
export function parentTransform(scene: Scene, object: Placeable): Transform {
  return ancestorsOf(scene, object).reduceRight<Transform>((outer, group) => compose(outer, transformOf(group)), IDENTITY);
}

/** An object's own transform, as seen from the top level. */
export function worldTransform(scene: Scene, object: Placeable): Transform {
  return compose(parentTransform(scene, object), transformOf(object));
}

/**
 * The given objects without those inside another one of them (a group's
 * insides go wherever the group goes), in the order given. Unknown ids and
 * cameras are kept as they are.
 */
export function topmost(scene: Scene, ids: readonly string[]): string[] {
  const chosen = new Set(ids);
  return [...new Set(ids)].filter((id) => {
    const object = scene.shapes.find((s) => s.id === id) ?? findGroup(scene, id);
    return !object || !ancestorsOf(scene, object).some((group) => chosen.has(group.id));
  });
}

/** The nearest group that holds all of these objects (undefined: the top level). */
export function commonParent(scene: Scene, objects: readonly Placeable[]): GroupData | undefined {
  if (objects.length === 0) return undefined;
  const chains = objects.map((object) => ancestorsOf(scene, object));
  return chains[0].find((group) => chains.every((chain) => chain.some((g) => g.id === group.id)));
}
