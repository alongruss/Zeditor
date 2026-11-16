import { describe, expect, it } from 'vitest';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { findGroup, worldTransform } from '../model/hierarchy';
import { applyTransform } from '../model/transform';
import type { Scene } from '../model/types';
import { recordFrame } from '../render/drawOps';
import { viewFromCamera } from '../render/view';
import { EXAMPLES, exampleScene } from '.';

describe('examples', () => {
  it('each opens like any scene file, and draws', () => {
    for (const example of EXAMPLES) {
      const scene = exampleScene(example);
      expect(scene.shapes.length, example.id).toBeGreaterThan(0);
      const ops = recordFrame(scene, viewFromCamera(scene.cameras[0]));
      expect(ops.length, example.id).toBeGreaterThan(20);
    }
  });

  it('Nippu keeps the demo’s structure: 90 shapes, 42 groups, four drawn together', () => {
    const scene = exampleScene(EXAMPLES.find((e) => e.id === 'nippu')!);
    expect(scene.shapes).toHaveLength(90);
    expect(scene.groups).toHaveLength(42);
    expect(scene.groups.filter((g) => g.drawTogether).map((g) => g.name).sort()).toEqual([
      'Glasses',
      'Laces group',
      'Laces group',
      'Phone back',
      'Phone front',
    ]);
    for (const name of ['Ground', 'Dude', 'Lady', 'Cloud', 'Left foot']) {
      expect(scene.groups.some((g) => g.name === name), name).toBe(true);
    }
  });

  it('the Turntable camera turns once and loops', () => {
    const scene = exampleScene(EXAMPLES.find((e) => e.id === 'nippu')!);
    const camera = scene.cameras.find((c) => c.name === 'Turntable')!;
    const start = objectAtFrame(camera, 0).rotate.y;
    const end = objectAtFrame(camera, scene.settings.duration).rotate.y;
    expect(start - end).toBe(360);
    expect(objectAtFrame(camera, 60).rotate.y).toBeCloseTo(start - 180, 6); // halfway, eased
  });

  describe('Nippu, walking', () => {
    const scene = exampleScene(EXAMPLES.find((e) => e.id === 'nippu-walking')!);
    const CYCLE = 30;
    /** A group by its path of names from the top. */
    const groupAt = (at: Scene, path: string) =>
      path.split('/').reduce<string | undefined>((parent, name) => at.groups.find((g) => g.name === name && g.parent === parent)?.id, undefined)!;
    /** How far down (world Y) a point in a group's space is, on a frame. */
    const lowY = (frame: number, path: string, point = { x: 0, y: 0, z: 0 }) => {
      const posed = sceneAtFrame(scene, frame);
      return applyTransform(worldTransform(posed, findGroup(posed, groupAt(posed, path))!), point).y;
    };
    const poseOf = (frame: number) => sceneAtFrame(scene, frame).groups.map((g) => [g.translate, g.rotate]);

    it('is the Nippu scene with the couple’s limbs keyed, and loops', () => {
      const still = exampleScene(EXAMPLES.find((e) => e.id === 'nippu')!);
      expect(scene.shapes).toEqual(still.shapes);
      expect(scene.groups.filter((g) => g.tracks).length).toBeGreaterThanOrEqual(12);
      expect(poseOf(scene.settings.duration)).toEqual(poseOf(0));
      // One step cycle, repeated: frame 7 looks like frame 37.
      expect(poseOf(7 + CYCLE)).toEqual(poseOf(7));
      // And it really moves.
      expect(poseOf(CYCLE / 2)).not.toEqual(poseOf(0));
    });

    it('keeps the planted foot on the ground (on every key)', () => {
      const dude = ['Right', 'Left'].map((side) => `Ground/Dude/Hips/${side} thigh/${side} shin/${side} ankle/Shoe`);
      const lady = ['Ground/Lady/Hips/Left leg/Left foot', 'Ground/Lady/Hips/Right thigh/Right shin/Right foot'];
      const soleOfShoe = { x: 0, y: 0, z: 0 };
      const toeOfFoot = { x: 0, y: 11, z: 0 }; // her shoes reach 11 down the foot
      const ground = (frame: number) => ({
        dude: Math.max(...dude.map((path) => lowY(frame, path, soleOfShoe))),
        lady: Math.max(...lady.map((path) => lowY(frame, path, toeOfFoot))),
      });
      const start = ground(0);
      for (let frame = 0; frame <= CYCLE; frame += 3) {
        expect(ground(frame).dude, `dude, frame ${frame}`).toBeCloseTo(start.dude, 2);
        expect(ground(frame).lady, `lady, frame ${frame}`).toBeCloseTo(start.lady, 2);
      }
      // Where the drawing has them standing.
      const still = exampleScene(EXAMPLES.find((e) => e.id === 'nippu')!);
      const drawn = applyTransform(worldTransform(still, findGroup(still, groupAt(still, dude[0]))!), soleOfShoe).y;
      expect(start.dude).toBeCloseTo(drawn, 2);
    });
  });
});
