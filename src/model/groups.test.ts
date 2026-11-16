import { describe, expect, it } from 'vitest';
import { setKey } from './animation';
import { groupObject, groupObjects, setParent, ungroup } from './groups';
import { childrenOf, findGroup, subtreeIds, topmost, worldTransform } from './hierarchy';
import { addShape, createGroup, createShape, duplicateObject, emptyScene, findShape, removeObject } from './scene';
import { parseSceneFile, serializeScene } from './sceneFile';
import { applyTransform } from './transform';
import type { GroupData, Placeable, Scene, ShapeData, Vec3 } from './types';

const POINTS: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 2, z: 3 },
  { x: -4, y: 0, z: 1 },
];

/** Where an object's points land in the world: the thing that must not change. */
const worldPoints = (scene: Scene, object: Placeable) => POINTS.map((p) => applyTransform(worldTransform(scene, object), p));

const expectSamePlace = (a: Vec3[], b: Vec3[]) =>
  a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i].x, 4);
    expect(p.y).toBeCloseTo(b[i].y, 4);
    expect(p.z).toBeCloseTo(b[i].z, 4);
  });

/** A turned, scaled group holding a box, and a cone at the top level. */
function sample(): Scene {
  let scene = emptyScene();
  const group: GroupData = { ...createGroup(scene), translate: { x: 5, y: -2, z: 1 }, rotate: { x: 20, y: -35, z: 10 }, scale: 1.5 };
  scene = { ...scene, groups: [group] };
  const box: ShapeData = { ...createShape(scene, 'Box'), translate: { x: 1, y: 2, z: -1 }, rotate: { x: 0, y: 45, z: 0 }, parent: group.id };
  scene = addShape(scene, box);
  const cone: ShapeData = { ...createShape(scene, 'Cone'), translate: { x: -3, y: 1, z: 2 }, rotate: { x: 10, y: 0, z: -30 } };
  return addShape(scene, cone);
}

describe('groups', () => {
  it('group, move into another group and ungroup all keep things where they are', () => {
    let scene = sample();
    const cone = findShape(scene, 'cone-1')!;
    const before = worldPoints(scene, cone);

    const grouped = groupObject(scene, 'cone-1');
    scene = grouped.scene;
    expect(findShape(scene, 'cone-1')!.parent).toBe(grouped.id);
    expectSamePlace(worldPoints(scene, findShape(scene, 'cone-1')!), before);

    scene = setParent(scene, 'cone-1', 'group-1').scene;
    expect(findShape(scene, 'cone-1')!.parent).toBe('group-1');
    expectSamePlace(worldPoints(scene, findShape(scene, 'cone-1')!), before);

    const box = findShape(scene, 'box-1')!;
    const boxBefore = worldPoints(scene, box);
    scene = ungroup(scene, 'group-1').scene;
    expect(findGroup(scene, 'group-1')).toBeUndefined();
    expect(findShape(scene, 'box-1')!.parent).toBeUndefined();
    expectSamePlace(worldPoints(scene, findShape(scene, 'box-1')!), boxBefore);
    expectSamePlace(worldPoints(scene, findShape(scene, 'cone-1')!), before);
  });

  it('refuses to put a group inside itself', () => {
    let scene = sample();
    scene = groupObject(scene, 'group-1').scene; // group-2 now holds group-1
    expect(setParent(scene, 'group-2', 'group-1').scene).toBe(scene);
    expect(setParent(scene, 'group-1', 'group-1').scene).toBe(scene);
  });

  it('keeps an animated object’s own values, and says so', () => {
    let scene = sample();
    const animated = setKey(findShape(scene, 'cone-1')!, 'translate.x', 0, -3);
    scene = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'cone-1' ? animated : s)) };
    const result = setParent(scene, 'cone-1', 'group-1');
    expect(result.kept).toBe(true);
    expect(findShape(result.scene, 'cone-1')!.translate).toEqual(animated.translate);
  });

  it('groups several objects from different groups into one, each keeping its place', () => {
    const scene = sample(); // group-1 › box-1, and cone-1 at the top
    const before = ['box-1', 'cone-1'].map((id) => worldPoints(scene, findShape(scene, id)!));
    const result = groupObjects(scene, ['box-1', 'cone-1']);
    expect(result.kept).toBe(false);
    const group = findGroup(result.scene, result.id!)!;
    // The nearest group holding both is the top level.
    expect(group.parent).toBeUndefined();
    expect(childrenOf(result.scene, group.id).map((o) => o.id).sort()).toEqual(['box-1', 'cone-1']);
    ['box-1', 'cone-1'].forEach((id, i) => expectSamePlace(worldPoints(result.scene, findShape(result.scene, id)!), before[i]));
    // The group sits at their middle, so it turns and scales around them.
    const box = worldTransform(scene, findShape(scene, 'box-1')!).translate;
    expect(group.translate.x).toBeCloseTo((box.x + -3) / 2, 3);
    expect(group.translate.z).toBeCloseTo((box.z + 2) / 2, 3);
  });

  it('groups siblings inside their own group, and takes a chosen group’s insides along with it', () => {
    let scene = sample();
    const cone: ShapeData = { ...createShape(scene, 'Cone'), translate: { x: 2, y: 0, z: 0 }, parent: 'group-1' };
    scene = addShape(scene, cone); // group-1 › box-1, cone-2
    const inner = groupObjects(scene, ['box-1', 'cone-2']);
    expect(findGroup(inner.scene, inner.id!)!.parent).toBe('group-1');

    // Choosing a group and something inside it: the group goes, and its insides with it.
    expect(topmost(scene, ['box-1', 'group-1', 'cone-1'])).toEqual(['group-1', 'cone-1']);
    const outer = groupObjects(scene, ['box-1', 'group-1', 'cone-1']);
    expect(findGroup(outer.scene, 'group-1')!.parent).toBe(outer.id);
    expect(findShape(outer.scene, 'box-1')!.parent).toBe('group-1');
  });

  it('groups several animated objects at their parent’s origin, so they stay put', () => {
    let scene = sample();
    const animated = setKey(findShape(scene, 'cone-1')!, 'translate.x', 0, -3);
    scene = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'cone-1' ? animated : s)) };
    const box: ShapeData = { ...createShape(scene, 'Box'), translate: { x: 4, y: 4, z: 4 } };
    scene = addShape(scene, box);
    const result = groupObjects(scene, ['cone-1', 'box-2']);
    expect(result.kept).toBe(false); // same parent: its keys still mean the same place
    expect(findGroup(result.scene, result.id!)!.translate).toEqual({ x: 0, y: 0, z: 0 });
    expect(findShape(result.scene, 'cone-1')!.translate).toEqual(animated.translate);
    expect(findShape(result.scene, 'box-2')!.translate).toEqual({ x: 4, y: 4, z: 4 });
    // Animated, and taken out of its group: it keeps its own values, and says so.
    const animatedBox = setKey(findShape(scene, 'box-1')!, 'rotate.y', 0, 45);
    scene = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'box-1' ? animatedBox : s)) };
    expect(groupObjects(scene, ['box-1', 'box-2']).kept).toBe(true);
  });

  it('refuses to group nothing, and groups one object as before', () => {
    const scene = sample();
    expect(groupObjects(scene, []).scene).toBe(scene);
    expect(groupObjects(scene, ['nope']).scene).toBe(scene);
    expect(groupObjects(scene, ['cone-1'])).toEqual(groupObject(scene, 'cone-1'));
  });

  it('delete and duplicate take a group with everything inside it', () => {
    let scene = groupObject(sample(), 'group-1').scene; // group-2 › group-1 › box-1
    const copy = duplicateObject(scene, 'group-2');
    scene = copy.scene;
    const inside = subtreeIds(scene, copy.id!);
    expect(inside.size).toBe(3); // the copy, its inner group and its box
    expect(scene.shapes.filter((s) => s.type === 'Box')).toHaveLength(2);
    // The copies point at the copies, not the originals.
    const innerCopy = childrenOf(scene, copy.id!)[0];
    expect(innerCopy.id).not.toBe('group-1');
    expect(childrenOf(scene, innerCopy.id)[0].id).not.toBe('box-1');

    scene = removeObject(scene, 'group-2');
    // Only the copy and its inner group are left; the original's box went with it.
    expect(new Set(scene.groups.map((g) => g.id))).toEqual(new Set([copy.id, innerCopy.id]));
    expect(findShape(scene, 'box-1')).toBeUndefined();
    expect(subtreeIds(scene, copy.id!).size).toBe(3);
  });
});

describe('scene files, version 4', () => {
  it('save then open keeps groups, parents and draw-together', () => {
    let scene = groupObject(sample(), 'cone-1').scene;
    scene = { ...scene, groups: scene.groups.map((g) => (g.id === 'group-1' ? { ...g, drawTogether: true } : g)) };
    expect(parseSceneFile(serializeScene(scene))).toEqual({ ok: true, scene });
  });

  const fileWith = (groups: unknown[], shapes: unknown[]) =>
    JSON.stringify({ version: 4, settings: {}, shapes, groups, cameras: [] });
  const errorOf = (text: string) => {
    const result = parseSceneFile(text);
    return result.ok ? null : result.error;
  };

  it('refuses unknown groups, loops and shared ids', () => {
    expect(errorOf(fileWith([], [{ id: 'box-1', name: 'Box', type: 'Box', parent: 'group-9' }]))).toMatch(/isn't in the scene/);
    expect(
      errorOf(
        fileWith(
          [
            { id: 'group-1', type: 'Group', parent: 'group-2' },
            { id: 'group-2', type: 'Group', parent: 'group-1' },
          ],
          [],
        ),
      ),
    ).toMatch(/inside itself/);
    expect(errorOf(fileWith([{ id: 'box-1', type: 'Group' }], [{ id: 'box-1', name: 'Box', type: 'Box' }]))).toMatch(/same id/);
  });

  it('opens version 3 files with no groups', () => {
    const result = parseSceneFile(JSON.stringify({ version: 3, settings: {}, shapes: [], cameras: [] }));
    expect(result.ok && result.scene.groups).toEqual([]);
  });
});
