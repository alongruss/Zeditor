import type * as ZdogTypes from 'zdog';
import { childrenOf } from '../model/hierarchy';
import type { GroupData, Scene } from '../model/types';
import { createZdogShape, zdogTransform } from '../viewport/toZdog';
import { Zdog } from '../zdog';

/**
 * The scene as a zdog graph: an Anchor (or, for a group that draws its
 * children together, a Group) per group, with its shapes and groups added
 * to it in the scene's sibling order. Used by the editor's view, the
 * Lottie bake and anything else that draws the scene, so they all agree.
 */

type Node = ZdogTypes.Anchor;

/** zdog's Anchor keeps its children and parent in untyped fields. */
interface NodeFields {
  children: Node[];
  addTo?: Node;
  updateFlatGraph?: () => void;
}

export function createZdogGroup(group: GroupData): Node {
  const options = zdogTransform(group);
  return group.drawTogether ? new Zdog.Group(options) : new Zdog.Anchor(options);
}

export function isZdogGroup(node: Node): boolean {
  return node instanceof Zdog.Group;
}

/**
 * Makes `kids` the node's children, in this order. A zdog Group keeps a
 * cached list of what it draws and never refreshes it by itself, so it is
 * refreshed here; otherwise a shape moved out of a Group would still be
 * drawn in it.
 */
export function setChildren(node: Node, kids: readonly Node[]): void {
  const fields = node as unknown as NodeFields;
  fields.children.splice(0, fields.children.length, ...kids);
  for (const kid of kids) (kid as unknown as NodeFields).addTo = node;
  if (isZdogGroup(node)) fields.updateFlatGraph?.();
}

/**
 * Adds the whole scene under `root` and returns every object's zdog node by
 * id. Something whose group is missing is drawn at the top level.
 */
export function buildZdogGraph(scene: Scene, root: Node): Map<string, Node> {
  const nodes = new Map<string, Node>();
  for (const group of scene.groups) nodes.set(group.id, createZdogGroup(group));
  for (const shape of scene.shapes) nodes.set(shape.id, createZdogShape(shape));
  attachAll(scene, root, nodes);
  return nodes;
}

/** Puts every node under its parent (or `root`), in the scene's order. */
export function attachAll(scene: Scene, root: Node, nodes: ReadonlyMap<string, Node>): void {
  const known = (id: string | undefined) => id !== undefined && nodes.has(id);
  const kidsOf = (parent: string | null) =>
    childrenOf(scene, parent)
      .map((object) => nodes.get(object.id))
      .filter((node): node is Node => node !== undefined);
  const orphans = [...scene.groups, ...scene.shapes]
    .filter((object) => object.parent !== undefined && !known(object.parent))
    .map((object) => nodes.get(object.id))
    .filter((node): node is Node => node !== undefined);
  setChildren(root, [...kidsOf(null), ...orphans]);
  for (const group of scene.groups) {
    const node = nodes.get(group.id);
    if (node) setChildren(node, kidsOf(group.id));
  }
}
