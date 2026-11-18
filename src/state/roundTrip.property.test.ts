import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertiesOf } from '../model/animatable';
import { MAX_FRAME } from '../model/limits';
import { parseSceneFile, serializeScene } from '../model/sceneFile';
import { starterScene } from '../model/starterScene';
import { SHAPE_TYPES, type SceneObject } from '../model/types';
import { typedNumber, stepNumber } from '../panels/fields';
import {
  addCameraCommand,
  addShapeOfType,
  deleteObject,
  duplicate,
  edit,
  groupCommand,
  moveKeysCommand,
  rename,
  retimeCommand,
  setTiming,
  toggleKey,
  ungroupCommand,
  type Command,
} from './commands';
import { applyCommand, startHistory } from './history';
import type { KeyRef } from '../model/keyEdits';

/** Any number at all: ordinary ones, huge ones, and the ones that aren't numbers. */
const anyNumber = fc.oneof(
  fc.double({ noNaN: false }),
  fc.integer({ min: -1e6, max: 1e6 }),
  fc.constantFrom(0, -0, 1e300, -1e300, Infinity, -Infinity, NaN, 5000, 1e9, MAX_FRAME + 1),
);
const anyFrame = fc.oneof(fc.integer({ min: 0, max: 200 }), fc.constantFrom(MAX_FRAME, MAX_FRAME * 10, 1e9));

const objectsOf = (state: Parameters<Command>[0]): SceneObject[] => [...state.scene.shapes, ...state.scene.groups, ...state.scene.cameras];

/** A command on the `n`th object in the scene at the time (whatever is there). */
const onObject =
  (n: number, make: (object: SceneObject) => Command): Command =>
  (state) => {
    const objects = objectsOf(state);
    return objects.length === 0 ? state : make(objects[n % objects.length])(state);
  };

/** Every number property the object has, set to `value` (through the Inspector's edit, on `frame`). */
const setNumber = (n: number, which: number, value: number, frame: number): Command =>
  onObject(n, (object) => {
    const numbers = propertiesOf(object.type).filter((spec) => spec.kind === 'number');
    const spec = numbers[which % numbers.length];
    const [head, axis] = spec.path.split('.');
    const patch = head === 'props' ? { props: { [axis]: value } } : axis ? { [head]: { [axis]: value } } : { [head]: value };
    return edit(object.id, patch, frame);
  });

const allKeys = (state: Parameters<Command>[0]): KeyRef[] =>
  objectsOf(state).flatMap((object) =>
    Object.entries(object.tracks ?? {}).flatMap(([path, keys]) => keys.map((key) => ({ objectId: object.id, path, frame: key.frame }))),
  );

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.tuple(fc.nat(), fc.nat(), anyNumber, anyFrame).map(([n, which, value, frame]) => setNumber(n, which, value, frame)),
  fc.tuple(fc.nat(), fc.nat(), anyFrame).map(([n, which, frame]) =>
    onObject(n, (object) => {
      const specs = propertiesOf(object.type);
      return toggleKey(object.id, [specs[which % specs.length].path], frame);
    }),
  ),
  fc.integer({ min: -MAX_FRAME, max: MAX_FRAME * 2 }).map((delta): Command => (state) =>
    moveKeysCommand(objectsOf(state), allKeys(state), delta)(state),
  ),
  fc.tuple(anyNumber, anyNumber).map(([fps, duration]) => setTiming({ fps, duration })),
  fc.constantFrom(1, 12, 24, 30, 60, 120).map((fps) => retimeCommand(fps)),
  fc.tuple(fc.nat(), fc.string({ unit: 'binary', maxLength: 400 })).map(([n, name]) => onObject(n, (o) => rename(o.id, name))),
  fc.constantFrom(...SHAPE_TYPES).map((type) => addShapeOfType(type)),
  fc.constant(addCameraCommand({ rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: 20, width: 640, height: 360 })),
  fc.nat().map((n) => onObject(n, (o) => duplicate(o.id))),
  fc.nat().map((n) => onObject(n, (o) => deleteObject(o.id))),
  fc.nat().map((n) => onObject(n, (o) => (o.type === 'Camera' ? (s) => s : groupCommand(o.id)))),
  fc.nat().map((n) => onObject(n, (o) => ungroupCommand(o.id))),
);

describe('whatever the editor holds can be saved and opened again', () => {
  it('after any edits, with any values typed or dragged in', () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 25 }), (commands) => {
        let history = startHistory({ scene: starterScene(), selectedId: null, selectedIds: [] });
        for (const run of commands) history = applyCommand(history, run);
        const saved = serializeScene(history.present.scene);
        const reopened = parseSceneFile(saved);
        expect(reopened.ok ? 'opens' : reopened.error).toBe('opens');
      }),
      { numRuns: 300 },
    );
  });
});

describe('number fields', () => {
  it('never give a value past the limits, or one that is not a number', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.double().map(String), fc.integer().map(String)),
        fc.integer({ min: -1000, max: 0 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.boolean(),
        (text, min, max, integer) => {
          const typed = typedNumber(text, { min, max, integer });
          if (typed === null) return;
          expect(Number.isFinite(typed.value)).toBe(true);
          expect(typed.value).toBeGreaterThanOrEqual(min);
          expect(typed.value).toBeLessThanOrEqual(max);
          if (integer) expect(Number.isInteger(typed.value)).toBe(true);
        },
      ),
    );
  });

  it('never step to a value that is not a number', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), fc.double({ noNaN: true }), (value, delta) => {
        if (!Number.isFinite(value)) return;
        expect(Number.isFinite(stepNumber(value, delta))).toBe(true);
      }),
    );
  });
});
