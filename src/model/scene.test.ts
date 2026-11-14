import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_OFFSET,
  addShape,
  createShape,
  duplicateShape,
  emptyScene,
  findShape,
  nextShapeId,
  removeShape,
  updateShape,
} from './scene';
import { SHAPE_TYPE_DEFS } from './shapeTypes';
import { starterScene } from './starterScene';
import { SHAPE_TYPES, type Scene } from './types';

function sceneWith(...types: (typeof SHAPE_TYPES)[number][]): Scene {
  return types.reduce((scene, type) => addShape(scene, createShape(scene, type)), emptyScene());
}

describe('shape ids and names', () => {
  it('numbers ids per type, starting at 1', () => {
    const scene = sceneWith('Box', 'Box', 'Cone', 'RoundedRect', 'Rect');
    expect(scene.shapes.map((s) => s.id)).toEqual([
      'box-1',
      'box-2',
      'cone-1',
      'rounded-rect-1',
      'rect-1',
    ]);
    expect(scene.shapes.map((s) => s.name)).toEqual([
      'Box 1',
      'Box 2',
      'Cone 1',
      'Rounded rectangle 1',
      'Rectangle 1',
    ]);
  });

  it('does not confuse rect with rounded-rect when numbering', () => {
    const scene = sceneWith('RoundedRect', 'RoundedRect');
    expect(nextShapeId(scene, 'Rect')).toBe('rect-1');
  });

  it('never hands out an id that is still in use', () => {
    let scene = sceneWith('Box', 'Box', 'Box');
    scene = removeShape(scene, 'box-2');
    expect(nextShapeId(scene, 'Box')).toBe('box-4');
  });

  it('refuses to add a duplicate id', () => {
    const scene = sceneWith('Box');
    expect(() => addShape(scene, scene.shapes[0])).toThrow(/already in scene/);
  });
});

describe('createShape', () => {
  it.each(SHAPE_TYPES)('gives a %s every default prop of its type', (type) => {
    const shape = createShape(emptyScene(), type);
    expect(shape.props).toEqual(SHAPE_TYPE_DEFS[type].defaults);
    expect(shape.translate).toEqual({ x: 0, y: 0, z: 0 });
    expect(shape.rotate).toEqual({ x: 0, y: 0, z: 0 });
    expect(shape.scale).toBe(1);
  });

  it('every editable field has a default', () => {
    for (const def of Object.values(SHAPE_TYPE_DEFS)) {
      for (const field of def.fields) {
        expect(def.defaults, `${def.type}.${field.key}`).toHaveProperty(field.key);
      }
    }
  });

  it('does not share nested objects with the type defaults', () => {
    const a = createShape(emptyScene(), 'Shape');
    const b = createShape(emptyScene(), 'Shape');
    expect(a.props.path).toEqual(b.props.path);
    expect(a.props.path).not.toBe(b.props.path);
    expect(a.props.path).not.toBe(SHAPE_TYPE_DEFS.Shape.defaults.path);
  });
});

describe('updateShape', () => {
  // 2020 bug: editing one shape also moved shapes that had been deselected,
  // and left them sharing a single `translate` object.
  it('changes only the target shape and never shares objects between shapes', () => {
    const before = starterScene();
    const after = updateShape(before, 'ellipse-1', { translate: { x: 9 } });

    const rect = findShape(after, 'rect-1')!;
    const ellipse = findShape(after, 'ellipse-1')!;
    expect(ellipse.translate).toEqual({ x: 9, y: 4, z: 4 });
    expect(rect).toBe(findShape(before, 'rect-1'));
    expect(rect.translate.x).toBe(-4);

    const again = updateShape(after, 'rect-1', { translate: { y: 1 } });
    expect(findShape(again, 'rect-1')!.translate).not.toBe(findShape(again, 'ellipse-1')!.translate);
    expect(findShape(again, 'ellipse-1')!.translate).toEqual({ x: 9, y: 4, z: 4 });
  });

  it('does not modify the previous scene', () => {
    const before = starterScene();
    const snapshot = structuredClone(before);
    updateShape(before, 'box-1', { rotate: { y: 45 }, scale: 2, props: { width: 9 } });
    expect(before).toEqual(snapshot);
  });

  it('merges partial vectors and props', () => {
    const after = updateShape(starterScene(), 'box-1', {
      rotate: { y: 45 },
      props: { topFace: '#000000' },
    });
    const box = findShape(after, 'box-1')!;
    expect(box.rotate).toEqual({ x: 0, y: 45, z: 0 });
    expect(box.props.topFace).toBe('#000000');
    expect(box.props.width).toBe(5);
  });

  it('returns the same scene for an unknown id', () => {
    const scene = starterScene();
    expect(updateShape(scene, 'nope-1', { scale: 3 })).toBe(scene);
  });
});

describe('removeShape', () => {
  it('removes only that shape', () => {
    const after = removeShape(starterScene(), 'cone-1');
    expect(after.shapes).toHaveLength(8);
    expect(findShape(after, 'cone-1')).toBeUndefined();
  });

  it('returns the same scene for an unknown id', () => {
    const scene = starterScene();
    expect(removeShape(scene, 'nope-1')).toBe(scene);
  });
});

describe('duplicateShape', () => {
  it('copies settings under a new id, offset, right after the original', () => {
    const before = starterScene();
    const { scene, id } = duplicateShape(before, 'cone-1');
    expect(id).toBe('cone-2');
    const index = scene.shapes.findIndex((s) => s.id === 'cone-1');
    expect(scene.shapes[index + 1].id).toBe('cone-2');

    const original = findShape(scene, 'cone-1')!;
    const copy = findShape(scene, 'cone-2')!;
    expect(copy.name).toBe('Cone 2');
    expect(copy.props).toEqual(original.props);
    expect(copy.translate).toEqual({
      x: original.translate.x + DUPLICATE_OFFSET.x,
      y: original.translate.y + DUPLICATE_OFFSET.y,
      z: original.translate.z + DUPLICATE_OFFSET.z,
    });
  });

  it('shares no nested objects with the original', () => {
    const { scene } = duplicateShape(starterScene(), 'shape-1');
    const original = findShape(scene, 'shape-1')!;
    const copy = findShape(scene, 'shape-2')!;
    expect(copy.props.path).toEqual(original.props.path);
    expect(copy.props.path).not.toBe(original.props.path);
    expect(copy.rotate).not.toBe(original.rotate);
  });

  it('does nothing for an unknown id', () => {
    const scene = starterScene();
    expect(duplicateShape(scene, 'nope-1')).toEqual({ scene, id: null });
  });
});

describe('starterScene', () => {
  it('has the nine 2020 shapes with unique ids', () => {
    const scene = starterScene();
    expect(scene.shapes).toHaveLength(9);
    expect(new Set(scene.shapes.map((s) => s.id)).size).toBe(9);
    expect(new Set(scene.shapes.map((s) => s.type))).toEqual(new Set(SHAPE_TYPES));
  });

  it('gives every shape a value for each of its fields', () => {
    for (const shape of starterScene().shapes) {
      for (const field of SHAPE_TYPE_DEFS[shape.type].fields) {
        expect(shape.props, `${shape.id}.${field.key}`).toHaveProperty(field.key);
      }
    }
  });
});
