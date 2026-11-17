import { describe, expect, it } from 'vitest';
import { propertiesOf, readBase } from './animatable';
import { editAtFrame, groupKeyState, keyState, removeKey, setKey, toggleKeys, trackValueAt, valueAt } from './animation';
import { EASING_CURVES, curveOf, ease, easingLabel, overshoots, readCurve, sameEasing } from './easing';
import { isAnimated, sceneAtFrame, shapeAtFrame } from './evaluate';
import { addShape, createShape, duplicateShape, emptyScene } from './scene';
import { EASINGS, SHAPE_TYPES, type Keyframe, type ShapeData } from './types';

const box = (): ShapeData => createShape(emptyScene(), 'Box');
const numberSpec = { path: 'translate.x', label: 'X', kind: 'number' as const };
const key = (frame: number, value: Keyframe['value'], easing: Keyframe['easing'] = 'linear'): Keyframe => ({
  frame,
  value,
  easing,
});

describe('ease', () => {
  it('starts at 0 and ends at 1 for every curve', () => {
    for (const easing of EASINGS.filter((e) => e !== 'hold')) {
      expect(ease(easing, 0)).toBeCloseTo(0);
      expect(ease(easing, 1)).toBeCloseTo(1);
    }
  });

  it('never goes backwards', () => {
    for (const easing of EASINGS) {
      let last = -1;
      for (let t = 0; t <= 1; t += 0.02) {
        const value = ease(easing, t);
        expect(value).toBeGreaterThanOrEqual(last - 1e-9);
        last = value;
      }
    }
  });

  it('starts slowly with Ease in and quickly with Ease out, like CSS', () => {
    expect(ease('linear', 0.25)).toBeCloseTo(0.25);
    expect(ease('easeIn', 0.25)).toBeLessThan(0.15);
    expect(ease('easeOut', 0.25)).toBeGreaterThan(0.35);
    expect(ease('easeInOut', 0.5)).toBeCloseTo(0.5);
    expect(ease('hold', 0.99)).toBe(0);
  });
});

describe('trackValueAt', () => {
  const track = [key(10, 0), key(20, 100, 'hold'), key(30, 50)];

  it('holds the first value before the first key and the last after the last', () => {
    expect(trackValueAt(track, 0, numberSpec)).toBe(0);
    expect(trackValueAt(track, 99, numberSpec)).toBe(50);
  });

  it('tweens between keys with the earlier key easing', () => {
    expect(trackValueAt(track, 15, numberSpec)).toBeCloseTo(50);
    expect(trackValueAt(track, 20, numberSpec)).toBe(100);
    // Hold: stays until the next key, then jumps.
    expect(trackValueAt(track, 29, numberSpec)).toBe(100);
    expect(trackValueAt(track, 30, numberSpec)).toBe(50);
  });

  it('keeps whole-number properties whole', () => {
    const sides = { path: 'props.sides', label: 'Sides', kind: 'number' as const, integer: true };
    expect(trackValueAt([key(0, 3), key(10, 8)], 5, sides)).toBe(6);
  });

  it('tweens colors through RGBA, alpha included', () => {
    const color = { path: 'props.color', label: 'Color', kind: 'color' as const };
    expect(trackValueAt([key(0, '#000000'), key(10, '#ffffff00')], 5, color)).toBe('#80808080');
  });

  it('holds booleans, and Box faces that switch between a color and "main color"', () => {
    const fill = { path: 'props.fill', label: 'Fill', kind: 'hold' as const };
    expect(trackValueAt([key(0, true), key(10, false)], 9, fill)).toBe(true);
    const face = { path: 'props.topFace', label: 'Top', kind: 'face' as const };
    expect(trackValueAt([key(0, '#ff0000'), key(10, true)], 5, face)).toBe('#ff0000');
    expect(trackValueAt([key(0, '#ff0000'), key(10, '#0000ff')], 5, face)).toBe('#800080');
  });
});

describe('editAtFrame', () => {
  it('changes the base value of properties that are not animated', () => {
    const edited = editAtFrame(box(), { translate: { x: 7 } }, 30);
    expect(edited.translate.x).toBe(7);
    expect(edited.tracks).toBeUndefined();
  });

  it('keys an animated property at the playhead', () => {
    const animated = setKey(box(), 'translate.x', 0, 0);
    const edited = editAtFrame(animated, { translate: { x: 9 } }, 40);
    expect(edited.tracks!['translate.x']).toEqual([key(0, 0, 'easeInOut'), key(40, 9, 'easeInOut')]);
    expect(edited.translate.x).toBe(animated.translate.x); // the base value is untouched
  });

  it('only touches what changed, so a gizmo drag on X never keys Y or Z', () => {
    let shape = setKey(box(), 'translate.x', 0, 0);
    shape = setKey(shape, 'translate.y', 0, 0);
    const now = { x: valueAt(shape, 'translate.x', 20), y: valueAt(shape, 'translate.y', 20) } as { x: number; y: number };
    const edited = editAtFrame(shape, { translate: { x: now.x + 5, y: now.y, z: shape.translate.z } }, 20);
    expect(edited.tracks!['translate.x']).toHaveLength(2);
    expect(edited.tracks!['translate.y']).toHaveLength(1);
    expect(edited.tracks!['translate.z']).toBeUndefined();
  });

  it('returns the same shape when nothing changes', () => {
    const shape = setKey(box(), 'translate.x', 0, 4);
    expect(editAtFrame(shape, { translate: { x: 4, y: shape.translate.y } }, 0)).toBe(shape);
  });

  it('stores keyed colors as hex', () => {
    const shape = setKey(box(), 'props.color', 0, 'red');
    expect(shape.tracks!['props.color'][0].value).toBe('#ff0000');
  });
});

describe('keyframe buttons', () => {
  it('cycle: not animated, then a key here, then removed again', () => {
    const shape = box();
    expect(keyState(shape, 'scale', 0)).toBe('none');
    const keyed = toggleKeys(shape, ['scale'], 0);
    expect(keyState(keyed, 'scale', 0)).toBe('key');
    expect(keyState(keyed, 'scale', 5)).toBe('track');
    expect(toggleKeys(keyed, ['scale'], 0).tracks).toBeUndefined();
  });

  it('removing the last key keeps the value it had, so nothing jumps', () => {
    let shape = setKey(box(), 'translate.x', 0, 0);
    shape = setKey(shape, 'translate.x', 10, 10);
    shape = removeKey(shape, 'translate.x', 0);
    shape = removeKey(shape, 'translate.x', 10);
    expect(shape.tracks).toBeUndefined();
    expect(shape.translate.x).toBe(10);
  });

  it('key x, y and z together for Position, and report a mix', () => {
    const paths = ['translate.x', 'translate.y', 'translate.z'];
    const partly = setKey(box(), 'translate.x', 0, 1);
    expect(groupKeyState(partly, paths, 0)).toBe('mixed');
    const all = toggleKeys(partly, paths, 0);
    expect(groupKeyState(all, paths, 0)).toBe('key');
    expect(groupKeyState(toggleKeys(all, paths, 0), paths, 0)).toBe('none');
  });
});

describe('evaluation', () => {
  it('poses a scene at a frame', () => {
    let shape = setKey(box(), 'translate.x', 0, 0);
    shape = setKey(shape, 'translate.x', 10, 10);
    const scene = addShape(emptyScene(), shape);
    expect(sceneAtFrame(scene, 5).shapes[0].translate.x).toBeCloseTo(5);
    expect(isAnimated(scene)).toBe(true);
    expect(isAnimated(emptyScene())).toBe(false);
  });

  it('keeps shapes as the same objects when nothing about them changes', () => {
    const still = box();
    expect(shapeAtFrame(still, 12)).toBe(still);
    const scene = addShape(emptyScene(), still);
    expect(sceneAtFrame(scene, 12)).toBe(scene);

    let moving = setKey(box(), 'translate.x', 0, 0);
    moving = setKey(moving, 'translate.x', 10, 10);
    // Past the last key the pose doesn't change, so it is the same object.
    expect(shapeAtFrame(moving, 20)).toBe(shapeAtFrame(moving, 30));
    // Unchanged parts are shared with the original.
    expect(shapeAtFrame(moving, 5).props).toBe(moving.props);
  });
});

describe('the animatable property list', () => {
  it.each(SHAPE_TYPES)('covers every %s Inspector field, and reads each one', (type) => {
    const shape = createShape(emptyScene(), type);
    for (const spec of propertiesOf(type)) expect(readBase(shape, spec.path), spec.path).toBeDefined();
    expect(propertiesOf(type).map((s) => s.path)).toEqual(
      expect.arrayContaining(['translate.x', 'rotate.z', 'scale', 'opacity', 'props.color']),
    );
  });

  it('duplicate copies the animation too, and shares nothing', () => {
    const animated = setKey(box(), 'translate.x', 0, 3);
    const scene = addShape(emptyScene(), animated);
    const { scene: after, id } = duplicateShape(scene, animated.id);
    const copy = after.shapes.find((s) => s.id === id)!;
    expect({ ...copy, id: animated.id, name: animated.name }).toEqual(animated);
    expect(copy.tracks).not.toBe(animated.tracks);
  });
});

describe('custom easing curves', () => {
  it('ease the same as the preset with the same numbers', () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.8, 1]) {
      expect(ease([0.42, 0, 0.58, 1], t)).toBeCloseTo(ease('easeInOut', t), 9);
      expect(ease([0, 0, 1, 1], t)).toBeCloseTo(t, 9);
    }
  });

  it('can overshoot and anticipate, past either key', () => {
    const back: [number, number, number, number] = [0.3, -0.6, 0.7, 1.6];
    const values = Array.from({ length: 21 }, (_, i) => ease(back, i / 20));
    expect(Math.min(...values)).toBeLessThan(0);
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(values[0]).toBe(0);
    expect(values[20]).toBeCloseTo(1, 6);
    expect(overshoots(back)).toBe(true);
    expect(overshoots('easeInOut')).toBe(false);
    expect(overshoots([0.2, 0, 0.8, 1])).toBe(false);
  });

  it('go past the keys for numbers, but within the setting limits; colors stop at the keys', () => {
    const back: Keyframe['easing'] = [0.3, -0.8, 0.7, 1.8];
    const opacity = { path: 'opacity', label: 'Opacity', kind: 'number' as const, min: 0, max: 1 };
    const track = [key(0, 0.05, back), key(20, 0.95)];
    const values = Array.from({ length: 21 }, (_, f) => trackValueAt(track, f, opacity) as number);
    expect(Math.min(...values)).toBe(0); // dipped below 0.05, stopped at 0
    expect(Math.max(...values)).toBe(1); // rose past 0.95, stopped at 1
    const free = Array.from({ length: 21 }, (_, f) => trackValueAt([key(0, 0, back), key(20, 10)], f, numberSpec) as number);
    expect(Math.min(...free)).toBeLessThan(0);
    expect(Math.max(...free)).toBeGreaterThan(10);
    const color = { path: 'props.color', label: 'Color', kind: 'color' as const };
    const colors = Array.from({ length: 21 }, (_, f) => trackValueAt([key(0, '#000000', back), key(20, '#808080')], f, color));
    const reds = colors.map((c) => parseInt((c as string).slice(1, 3), 16));
    expect(Math.min(...reds)).toBe(0);
    expect(Math.max(...reds)).toBe(0x80);
  });

  it('have a label, compare by their numbers, and are read from files only within the limits', () => {
    expect(easingLabel([0.1, 0.2, 0.3, 0.4])).toBe('Custom curve');
    expect(easingLabel('easeIn')).toBe('Ease in');
    expect(sameEasing([0.1, 0.2, 0.3, 0.4], [0.1, 0.2, 0.3, 0.4])).toBe(true);
    expect(sameEasing([0.1, 0.2, 0.3, 0.4], [0.1, 0.2, 0.3, 0.5])).toBe(false);
    expect(sameEasing('linear', [0, 0, 1, 1])).toBe(false);
    expect(curveOf('easeOut')).toEqual(EASING_CURVES.easeOut);
    expect(curveOf('hold')).toBeNull();
    expect(readCurve([0.2, -1, 1, 2])).toEqual([0.2, -1, 1, 2]);
    for (const bad of [[1.2, 0, 0, 1], [0, 0, -0.1, 1], [0, 2.5, 1, 1], [0, 0, 1], [0, 0, 1, 'x'], [0, 0, 1, Infinity], 'curve']) {
      expect(readCurve(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
