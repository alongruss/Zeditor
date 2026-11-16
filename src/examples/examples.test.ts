import { describe, expect, it } from 'vitest';
import { objectAtFrame } from '../model/evaluate';
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
});
