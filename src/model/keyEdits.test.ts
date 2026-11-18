import { describe, expect, it } from 'vitest';
import { setKey, valueAt } from './animation';
import {
  copyKeys,
  deleteKeys,
  keyExists,
  moveKeys,
  moveKeysInScene,
  pasteKeys,
  pasteTargets,
  retime,
  setKeysEasing,
  sharedEasing,
  type KeyRef,
} from './keyEdits';
import { MAX_FRAME } from './limits';
import { addShape, createGroup, createShape, emptyScene } from './scene';
import type { Scene, ShapeData } from './types';

/** A Box with X keyed at frames 0 (0), 10 (10) and 20 (20), and Y at 0. */
function animatedBox(): ShapeData {
  let shape = createShape(emptyScene(), 'Box');
  for (const frame of [0, 10, 20]) shape = setKey(shape, 'translate.x', frame, frame);
  return setKey(shape, 'translate.y', 0, 4);
}

const sceneWith = (shape: ShapeData): Scene => addShape(emptyScene(), shape);
const x = (frame: number): KeyRef => ({ objectId: 'box-1', path: 'translate.x', frame });
const framesOf = (scene: Scene, path = 'translate.x') => scene.shapes[0].tracks![path].map((k) => k.frame);

describe('moveKeys', () => {
  it('moves the chosen keys and reports where they went', () => {
    const box = animatedBox();
    const { shapes, refs } = moveKeys([box], [x(10)], 5);
    expect(shapes.get('box-1')!.tracks!['translate.x'].map((k) => [k.frame, k.value])).toEqual([
      [0, 0],
      [15, 10],
      [20, 20],
    ]);
    expect(refs).toEqual([x(15)]);
  });

  it('replaces a key it lands on, and never goes before frame 0', () => {
    const box = animatedBox();
    const landed = moveKeys([box], [x(10)], 10).shapes.get('box-1')!;
    expect(landed.tracks!['translate.x'].map((k) => [k.frame, k.value])).toEqual([
      [0, 0],
      [20, 10],
    ]);
    const clamped = moveKeys([box], [x(10), x(20)], -50);
    // Both reach frame 0; the later key wins.
    expect(clamped.shapes.get('box-1')!.tracks!['translate.x'].map((k) => [k.frame, k.value])).toEqual([[0, 20]]);
  });

  it('works from where the drag began, so passing over a key does not lose it', () => {
    const box = animatedBox();
    let scene = sceneWith(box);
    scene = moveKeysInScene(scene, [box], [x(10)], 10); // over the key on 20
    scene = moveKeysInScene(scene, [box], [x(10)], 2); // and back
    expect(framesOf(scene)).toEqual([0, 12, 20]);
  });

  it('never goes past the last frame a scene can have', () => {
    const box = animatedBox();
    const moved = moveKeys([box], [x(20)], MAX_FRAME * 3).shapes.get('box-1')!;
    expect(moved.tracks!['translate.x'].map((k) => k.frame)).toEqual([0, 10, MAX_FRAME]);
  });

  it('leaves the other properties alone', () => {
    const box = animatedBox();
    const scene = moveKeysInScene(sceneWith(box), [box], [x(0)], 3);
    expect(framesOf(scene, 'translate.y')).toEqual([0]);
  });
});

describe('deleteKeys', () => {
  it('deletes the keys, and keeps the value when the last one goes', () => {
    const scene = sceneWith(animatedBox());
    expect(framesOf(deleteKeys(scene, [x(10)]))).toEqual([0, 20]);
    const none = deleteKeys(scene, [x(0), x(10), x(20)]);
    expect(none.shapes[0].tracks!['translate.x']).toBeUndefined();
    expect(none.shapes[0].translate.x).toBe(20);
    expect(keyExists(scene, x(10))).toBe(true);
    expect(keyExists(deleteKeys(scene, [x(10)]), x(10))).toBe(false);
  });
});

describe('setKeysEasing', () => {
  it('changes the easing of the chosen keys only', () => {
    const scene = setKeysEasing(sceneWith(animatedBox()), [x(0), x(20)], 'hold');
    expect(scene.shapes[0].tracks!['translate.x'].map((k) => k.easing)).toEqual(['hold', 'easeInOut', 'hold']);
    expect(sharedEasing(scene, [x(0), x(20)])).toBe('hold');
    expect(sharedEasing(scene, [x(0), x(10)])).toBe('mixed');
    expect(sharedEasing(scene, [])).toBeNull();
    // Custom curves: the same numbers are the same easing, and setting them again changes nothing.
    const curved = setKeysEasing(scene, [x(0), x(20)], [0.2, 0.1, 0.3, 1.4]);
    expect(sharedEasing(curved, [x(0), x(20)])).toEqual([0.2, 0.1, 0.3, 1.4]);
    expect(setKeysEasing(curved, [x(0)], [0.2, 0.1, 0.3, 1.4])).toBe(curved);
    // Hold: the value jumps at the next key.
    expect(valueAt(scene.shapes[0], 'translate.x', 9)).toBe(0);
  });
});

describe('retime', () => {
  it('stops at the longest length, so the scene can still be saved and opened', () => {
    let scene = sceneWith(setKey(animatedBox(), 'translate.x', 90000, 1));
    scene = { ...scene, settings: { ...scene.settings, fps: 12, duration: MAX_FRAME } };
    const faster = retime(scene, 60);
    expect(faster.settings.duration).toBe(MAX_FRAME);
    expect(Math.max(...framesOf(faster))).toBe(MAX_FRAME);
  });

  it('keeps the timing in seconds at a new frame rate', () => {
    const scene = retime(sceneWith(animatedBox()), 60);
    expect(scene.settings).toMatchObject({ fps: 60, duration: 180 });
    expect(framesOf(scene)).toEqual([0, 20, 40]);
  });

  it('rounds to whole frames, keeping the later key when two meet', () => {
    let box = createShape(emptyScene(), 'Box');
    box = setKey(box, 'scale', 0, 1);
    box = setKey(box, 'scale', 1, 2);
    box = setKey(box, 'scale', 2, 3);
    const scene = retime(sceneWith(box), 12); // 30 -> 12 fps: frames 0, 0.4, 0.8 -> 0, 0, 1
    expect(scene.shapes[0].tracks!.scale.map((k) => [k.frame, k.value])).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
});

describe('copy and paste keys', () => {
  /** box-1 animated as in animatedBox, a plain Box (box-2) and a group, in a 60-frame scene. */
  function threeObjects(): Scene {
    let scene = sceneWith(animatedBox());
    scene = { ...scene, settings: { ...scene.settings, duration: 60 } };
    scene = addShape(scene, createShape(scene, 'Box'));
    return { ...scene, groups: [createGroup(scene)] };
  }
  const tracksOf = (scene: Scene, id: string, path = 'translate.x') =>
    [...scene.shapes, ...scene.groups].find((o) => o.id === id)!.tracks?.[path]?.map((k) => [k.frame, k.value, k.easing]);

  it('copies keys with frames counted from the first one', () => {
    const clip = copyKeys(threeObjects(), [x(10), x(20), { objectId: 'box-1', path: 'translate.y', frame: 0 }])!;
    expect(clip.count).toBe(3);
    expect(clip.sources).toEqual([
      {
        objectId: 'box-1',
        keys: [
          { path: 'translate.x', offset: 10, value: 10, easing: 'easeInOut' },
          { path: 'translate.x', offset: 20, value: 20, easing: 'easeInOut' },
          { path: 'translate.y', offset: 0, value: 4, easing: 'easeInOut' },
        ],
      },
    ]);
    expect(copyKeys(threeObjects(), [x(5)])).toBeNull();
  });

  it('pastes with the first key on the frame given, keeping spacing and easing, and replacing keys there', () => {
    let scene = threeObjects();
    scene = setKeysEasing(scene, [x(10)], 'hold');
    const clip = copyKeys(scene, [x(10), x(20)])!;
    const { scene: pasted, refs } = pasteKeys(scene, clip, 20, pasteTargets(scene, clip, []));
    expect(tracksOf(pasted, 'box-1')).toEqual([
      [0, 0, 'easeInOut'],
      [10, 10, 'hold'],
      [20, 10, 'hold'],
      [30, 20, 'easeInOut'],
    ]);
    expect(refs).toEqual([x(20), x(30)]);
  });

  it("puts keys copied from one object onto the selected one, starting its track", () => {
    const scene = threeObjects();
    const clip = copyKeys(scene, [x(0), x(10)])!;
    const targets = pasteTargets(scene, clip, ['box-2']);
    expect(targets.get('box-1')).toBe('box-2');
    const { scene: pasted } = pasteKeys(scene, clip, 15, targets);
    expect(tracksOf(pasted, 'box-2')).toEqual([
      [15, 0, 'easeInOut'],
      [25, 10, 'easeInOut'],
    ]);
    expect(tracksOf(pasted, 'box-1')).toEqual(tracksOf(scene, 'box-1'));
  });

  it("goes back to the keys' own objects when several were copied from, or the selection can't take them", () => {
    let scene = threeObjects();
    scene = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'box-2' ? setKey(s, 'translate.x', 0, 1) : s)) };
    const two = copyKeys(scene, [x(0), { objectId: 'box-2', path: 'translate.x', frame: 0 }])!;
    expect([...pasteTargets(scene, two, ['group-1'])]).toEqual([
      ['box-1', 'box-1'],
      ['box-2', 'box-2'],
    ]);
    const opacity = copyKeys(
      { ...scene, shapes: scene.shapes.map((s) => (s.id === 'box-1' ? setKey(s, 'opacity', 0, 0.5) : s)) },
      [{ objectId: 'box-1', path: 'opacity', frame: 0 }],
    )!;
    // A group has no opacity.
    expect(pasteTargets(scene, opacity, ['group-1']).get('box-1')).toBe('box-1');
  });

  it('leaves out keys past the last frame and settings the object lacks, and says how many', () => {
    let scene = threeObjects();
    scene = { ...scene, shapes: scene.shapes.map((s) => (s.id === 'box-1' ? setKey(s, 'opacity', 0, 0.5) : s)) };
    const clip = copyKeys(scene, [x(0), x(20), { objectId: 'box-1', path: 'opacity', frame: 0 }])!;
    const result = pasteKeys(scene, clip, 45, new Map([['box-1', 'group-1']]));
    expect(result.pastEnd).toBe(1);
    expect(result.unsupported).toBe(1);
    expect(tracksOf(result.scene, 'group-1')).toEqual([[45, 0, 'easeInOut']]);
    expect(pasteKeys(scene, clip, 70, new Map()).scene).toBe(scene);
  });
});
