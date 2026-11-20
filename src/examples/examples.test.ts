import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { findGroup, worldTransform } from '../model/hierarchy';
import { applyTransform } from '../model/transform';
import type { Scene } from '../model/types';
import { recordFrame } from '../render/drawOps';
import { viewFromCamera } from '../render/view';
import { EXAMPLES, exampleScene } from '.';

/** Every example's scene by id, read as the File menu reads it. */
const scenes = new Map(await Promise.all(EXAMPLES.map(async (example) => [example.id, await exampleScene(example)] as const)));
const sceneOf = (id: string): Scene => scenes.get(id)!;

describe('examples', () => {
  it('each opens like any scene file, and draws', () => {
    for (const example of EXAMPLES) {
      const scene = sceneOf(example.id);
      expect(scene.shapes.length, example.id).toBeGreaterThan(0);
      const ops = recordFrame(scene, viewFromCamera(scene.cameras[0]));
      expect(ops.length, example.id).toBeGreaterThan(20);
    }
  });

  it('Nippu keeps the demo’s structure: 90 shapes, 42 groups, four drawn together', () => {
    const scene = sceneOf('nippu');
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
    const scene = sceneOf('nippu');
    const camera = scene.cameras.find((c) => c.name === 'Turntable')!;
    const start = objectAtFrame(camera, 0).rotate.y;
    const end = objectAtFrame(camera, scene.settings.duration).rotate.y;
    expect(start - end).toBe(360);
    expect(objectAtFrame(camera, 60).rotate.y).toBeCloseTo(start - 180, 6); // halfway, eased
  });

  describe('Nippu, walking', () => {
    const scene = sceneOf('nippu-walking');
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
      const still = sceneOf('nippu');
      // The same shapes, but the lady's straight left leg is cut at a knee (16 + 10, like her right).
      const leg = (at: Scene) => at.shapes.find((s) => s.parent === groupAt(at, 'Ground/Lady/Hips/Left leg'))!;
      const shin = (at: Scene) => at.shapes.find((s) => s.parent === groupAt(at, 'Ground/Lady/Hips/Left leg/Left shin'))!;
      expect(scene.shapes).toHaveLength(still.shapes.length + 1);
      expect(leg(scene).props.path).toEqual([{ y: 0 }, { y: 16 }]);
      expect(shin(scene).props.path).toEqual([{ y: 0 }, { y: 10 }]);
      const others = (at: Scene) => at.shapes.filter((s) => s.id !== leg(at).id && s.id !== shin(scene).id);
      expect(others(scene)).toEqual(others(still));

      expect(scene.groups.filter((g) => g.tracks).length).toBeGreaterThanOrEqual(16);
      expect(poseOf(scene.settings.duration)).toEqual(poseOf(0));
      // One step cycle, repeated: frame 7 looks like frame 37.
      expect(poseOf(7 + CYCLE)).toEqual(poseOf(7));
      // And it really moves.
      expect(poseOf(CYCLE / 2)).not.toEqual(poseOf(0));
    });

    // The lowest points of a shoe: his soles' ends; her toe and heel tip.
    const DUDE_SOLE = [
      { x: 0, y: -7, z: 4 },
      { x: 0, y: 7, z: 4 },
    ];
    const LADY_SOLE = [
      { x: 0, y: 11, z: 2 },
      { x: 0, y: 11, z: -4 },
    ];
    const DUDE_FEET = ['Right', 'Left'].map((side) => `Ground/Dude/Hips/${side} thigh/${side} shin/${side} ankle/Shoe`);
    const LADY_FEET = ['Ground/Lady/Hips/Left leg/Left shin/Left foot', 'Ground/Lady/Hips/Right thigh/Right shin/Right foot'];
    const floorAt = (frame: number, feet: string[], sole: typeof DUDE_SOLE) =>
      Math.max(...feet.flatMap((path) => sole.map((point) => lowY(frame, path, point))));

    it('keeps a foot on the floor, where the drawing has them standing (on every key)', () => {
      const still = sceneOf('nippu');
      const drawn = (path: string, sole: typeof DUDE_SOLE) =>
        Math.max(...sole.map((point) => applyTransform(worldTransform(still, findGroup(still, groupAt(still, path))!), point).y));
      const dudeFloor = drawn(DUDE_FEET[0], DUDE_SOLE);
      const ladyFloor = Math.max(drawn('Ground/Lady/Hips/Left leg/Left foot', LADY_SOLE), drawn(LADY_FEET[1], LADY_SOLE));
      for (let frame = 0; frame <= CYCLE; frame += 3) {
        expect(floorAt(frame, DUDE_FEET, DUDE_SOLE), `dude, frame ${frame}`).toBeCloseTo(dudeFloor, 2);
        expect(floorAt(frame, LADY_FEET, LADY_SOLE), `lady, frame ${frame}`).toBeCloseTo(ladyFloor, 2);
      }
    });

    it('stands his planted shoe flat, and her feet level, as the body passes over them', () => {
      // Mid-stance: the right leg's foot is down and level (phase 0.5 = frame 15).
      const flat = (frame: number, path: string, sole: typeof DUDE_SOLE) => sole.map((point) => lowY(frame, path, point));
      const [heel, toe] = flat(15, DUDE_FEET[0], DUDE_SOLE);
      expect(heel).toBeCloseTo(toe, 1);
      // Hers, half a step later: her left foot at frame 15, her right at frame 0.
      const [ladyToe, ladyHeel] = flat(15, LADY_FEET[0], LADY_SOLE);
      expect(ladyToe).toBeCloseTo(ladyHeel, 1);
    });

    it('bobs the same on both legs (no limp)', () => {
      const height = (path: string, frame: number) => sceneAtFrame(scene, frame).groups.find((g) => g.id === groupAt(scene, path))!.translate.y;
      for (const body of ['Ground/Dude', 'Ground/Lady/Hips']) {
        for (let frame = 0; frame < CYCLE / 2; frame += 3) {
          expect(height(body, frame + CYCLE / 2), `${body}, frame ${frame}`).toBeCloseTo(height(body, frame), 2);
        }
      }
    });
  });
});

describe('All the bombs at once', () => {
  const example = EXAMPLES.find((e) => e.id === 'all-the-bombs')!;
  const scene = sceneOf('all-the-bombs');
  const film = scene.cameras.find((c) => c.name === 'Film')!;
  // Each shot: its first frame, the frame after its last, and the set it films.
  const SHOTS = [
    [0, 120, '1 · The stockpile'],
    [120, 270, '2 · The button'],
    [270, 420, '3 · The mushroom cloud'],
    [420, 600, '4 · Winter, then spring'],
  ] as const;

  it('credits the Kurzgesagt video it is after, and opens through its Film camera', () => {
    expect(example.credit).toContain('Kurzgesagt – In a Nutshell');
    expect(example.credit).toContain('What If We Detonated All Nuclear Bombs at Once?');
    expect(example.credit).toContain('youtube.com/watch?v=JyECrGp-Sw8');
    expect(example.credit).toContain('not made or endorsed by Kurzgesagt');
    expect(example.lookThrough).toBe(film.id);
    expect(scene.settings.duration).toBe(600);
  });

  it('cuts the Film camera from set to set (in a row, 600 apart), staying on each for its whole shot', () => {
    for (const [from, to, name] of SHOTS) {
      const set = scene.groups.find((g) => g.name === name && g.parent === undefined)!;
      for (let frame = from; frame < to; frame += 5) {
        expect(Math.abs(objectAtFrame(film, frame).target.x - set.translate.x), `${name}, frame ${frame}`).toBeLessThan(10);
      }
      expect(Math.abs(objectAtFrame(film, to - 1).target.x - set.translate.x)).toBeLessThan(10);
    }
  });

  it('draws every frame it is filmed on', () => {
    for (let frame = 0; frame < scene.settings.duration; frame += 15) {
      const ops = recordFrame(sceneAtFrame(scene, frame), viewFromCamera(objectAtFrame(film, frame)));
      expect(ops.length, `frame ${frame}`).toBeGreaterThan(50);
    }
  });

  it('is the file that scripts/make-all-the-bombs.mjs makes', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'zeditor-')), 'all-the-bombs.zeditor.json');
    execFileSync(process.execPath, ['scripts/make-all-the-bombs.mjs', out]);
    const lines = (text: string) => text.replace(/\r\n/g, '\n');
    expect(lines(readFileSync(out, 'utf8'))).toBe(lines(readFileSync('src/examples/all-the-bombs.zeditor.json', 'utf8')));
  });
});
