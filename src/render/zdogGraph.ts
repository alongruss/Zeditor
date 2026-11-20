import type * as ZdogTypes from 'zdog';
import type { GroupData, Placeable, Scene } from '../model/types';
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

/** Makes `kids` the node's children, in this order (see attachAll for zdog Groups). */
function setChildren(node: Node, kids: readonly Node[]): void {
  const fields = node as unknown as NodeFields;
  fields.children.splice(0, fields.children.length, ...kids);
  for (const kid of kids) (kid as unknown as NodeFields).addTo = node;
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

/**
 * Puts every node under its parent (or `root`), in the scene's order: a
 * parent's groups, then its shapes. A zdog Group keeps a cached list of
 * everything it draws, its groups' shapes too, and never refreshes it by
 * itself, so each is refreshed once everything is in place; otherwise a shape
 * moved out of a Group would still be drawn in it, and a group inside a
 * Group, filled after the Group was, wouldn't be drawn.
 */
export function attachAll(scene: Scene, root: Node, nodes: ReadonlyMap<string, Node>): void {
  // Everyone's children in one pass (this runs on every frame of playback).
  const kids = new Map<string | null, Node[]>();
  const orphans: Node[] = [];
  const place = (object: Placeable) => {
    const node = nodes.get(object.id);
    if (!node) return;
    const parent = object.parent ?? null;
    if (parent !== null && !nodes.has(parent)) {
      orphans.push(node);
      return;
    }
    const list = kids.get(parent);
    if (list) list.push(node);
    else kids.set(parent, [node]);
  };
  scene.groups.forEach(place);
  scene.shapes.forEach(place);
  setChildren(root, [...(kids.get(null) ?? []), ...orphans]);
  for (const group of scene.groups) {
    const node = nodes.get(group.id);
    if (node) setChildren(node, kids.get(group.id) ?? []);
  }
  for (const group of scene.groups) {
    const node = nodes.get(group.id);
    if (node && isZdogGroup(node)) (node as unknown as NodeFields).updateFlatGraph?.();
  }
}
