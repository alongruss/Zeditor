import { describe, expect, it } from 'vitest';
import { setKey, valueAt } from './animation';
import { deleteKeys, keyExists, moveKeys, moveKeysInScene, retime, setKeysEasing, sharedEasing, type KeyRef } from './keyEdits';
import { addShape, createShape, emptyScene } from './scene';
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
    // Hold: the value jumps at the next key.
    expect(valueAt(scene.shapes[0], 'translate.x', 9)).toBe(0);
  });
});

describe('retime', () => {
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
