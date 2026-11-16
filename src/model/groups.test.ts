import { describe, expect, it } from 'vitest';
import { setKey } from './animation';
import { groupObject, setParent, ungroup } from './groups';
import { childrenOf, findGroup, subtreeIds, worldTransform } from './hierarchy';
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
