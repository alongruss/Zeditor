import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordFrame } from '../render/drawOps';
import type { ViewSpec } from '../render/view';
import { sceneAtFrame } from './evaluate';
import { parseSceneFile, readPath } from './sceneFile';
import { SCENE_VERSION, type Scene } from './types';

const FRONT: ViewSpec = { rotate: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, pixelsPerUnit: 10, width: 200, height: 100 };

/** A scene "draws" when zdog can lay out and draw it, at the start, the middle and the end. */
function draws(scene: Scene): void {
  const { duration } = scene.settings;
  for (const frame of [0, Math.floor(duration / 2), duration - 1]) recordFrame(sceneAtFrame(scene, frame), FRONT);
}

/** A small file with one of everything a file can hold: paths of each kind, a group, a camera, animation. */
const BASE = {
  version: SCENE_VERSION,
  settings: { background: '#ffeedd', fps: 24, duration: 48 },
  shapes: [
    {
      id: 'line-1',
      name: 'Line 1',
      type: 'Shape',
      parent: 'group-1',
      props: {
        path: [{ x: -2 }, { line: { x: 2 } }, { arc: [{ x: 2, y: 2 }, { x: 0, y: 2 }] }, { bezier: [{ x: 0 }, { y: 1 }, { z: 3 }] }, { move: [{ y: -1 }] }],
        color: 'rgb(10, 20, 30)',
        stroke: 1,
        closed: false,
      },
      tracks: { 'translate.x': [{ frame: 0, value: 0 }, { frame: 24, value: 5, easing: 'linear' }] },
    },
    { id: 'poly-1', name: 'Polygon 1', type: 'Polygon', props: { sides: 6, radius: 3, color: 'hsl(120, 50%, 50%)' } },
    { id: 'box-1', name: 'Box 1', type: 'Box', translate: { x: 1, y: 2, z: 3 }, rotate: { y: 45 }, scale: 2, opacity: 0.5 },
  ],
  groups: [{ id: 'group-1', name: 'Group 1', type: 'Group', translate: { x: 1 }, scale: 1.5 }],
  cameras: [{ id: 'camera-1', name: 'Camera 1', type: 'Camera', viewSpan: 20, width: 640, height: 360 }],
};

type Json = unknown;

/** Every place in a JSON tree, as the keys that lead there. */
function placesIn(node: Json, at: readonly (string | number)[] = []): (string | number)[][] {
  const here = [[...at]];
  if (Array.isArray(node)) return [...here, ...node.flatMap((item, i) => placesIn(item, [...at, i]))];
  if (typeof node === 'object' && node !== null) return [...here, ...Object.entries(node).flatMap(([key, item]) => placesIn(item, [...at, key]))];
  return here;
}

/** `node` with the value at `place` replaced (or, when `value` is undefined, taken out). */
function changedAt(node: Json, place: readonly (string | number)[], value: Json): Json {
  if (place.length === 0) return value;
  const [head, ...rest] = place;
  if (Array.isArray(node)) {
    const copy = [...node];
    if (value === undefined && rest.length === 0) copy.splice(head as number, 1);
    else copy[head as number] = changedAt(copy[head as number], rest, value);
    return copy;
  }
  const copy: Record<string, Json> = { ...(node as Record<string, Json>) };
  if (value === undefined && rest.length === 0) delete copy[head];
  else copy[head] = changedAt(copy[head], rest, value);
  return copy;
}

/** Values a careless or hostile file might hold. */
const oddValue: fc.Arbitrary<Json> = fc.oneof(
  fc.jsonValue({ maxDepth: 3 }),
  fc.constantFrom<Json>(
    undefined,
    [],
    {},
    [{}],
    null,
    -1,
    0,
    1e9,
    -1e300,
    1.5,
    '',
    'x'.repeat(10000),
    '‮evil',
    '</script>',
    [{ line: [] }],
    [{ arc: [{ x: 1 }] }],
    [{ bezier: [{ x: 1 }, { y: 1 }] }],
    [{ x: 1, line: { x: 2 } }],
    [{ x: 'a' }],
    [{ w: 1 }],
    JSON.parse('[{"__proto__": {"x": 1}}]'),
    JSON.parse('{"__proto__": {"polluted": true}}'),
  ),
);

/** Reading never throws, and whatever opens can be drawn. */
function check(text: string): void {
  const result = parseSceneFile(text);
  if (result.ok) draws(result.scene);
  else expect(typeof result.error).toBe('string');
}

describe('opening any file', () => {
  it('the base file opens and draws', () => {
    const result = parseSceneFile(JSON.stringify(BASE));
    expect(result.ok ? 'opens' : result.error).toBe('opens');
    if (result.ok) draws(result.scene);
  });

  it('never throws on any JSON, and anything that opens draws', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => check(JSON.stringify(value))), { numRuns: 300 });
    fc.assert(fc.property(fc.string(), check), { numRuns: 200 });
  });

  it('a file with any one, two or three values changed never throws, and anything that opens draws', () => {
    const places = placesIn(BASE);
    const change = fc.tuple(fc.nat({ max: places.length - 1 }), oddValue);
    fc.assert(
      fc.property(fc.array(change, { minLength: 1, maxLength: 3 }), (changes) => {
        let file: Json = BASE;
        for (const [n, value] of changes) {
          // A place may be gone after an earlier change; then this change lands on the whole file.
          const place = placesIn(file)[n] ?? [];
          file = changedAt(file, place, value);
        }
        check(JSON.stringify(file) ?? 'null');
      }),
      { numRuns: 500 },
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a path with any part changed never throws, and opens only if it draws', () => {
    const at = ['shapes', 0, 'props', 'path'];
    const places = placesIn(BASE.shapes[0].props!.path, at);
    fc.assert(
      fc.property(fc.nat({ max: places.length - 1 }), oddValue, (n, value) => {
        check(JSON.stringify(changedAt(BASE, places[n], value)));
      }),
      { numRuns: 400 },
    );
  });
});

describe('paths in files', () => {
  it('takes points and commands with the right number of points', () => {
    expect(readPath([{}])).toEqual([{}]);
    expect(readPath([{ x: 1 }, { line: { y: 2 } }, { move: [{ z: 3 }] }])).toEqual([{ x: 1 }, { line: { y: 2 } }, { move: [{ z: 3 }] }]);
    expect(readPath([{}, { arc: [{}, { x: 1 }] }, { bezier: [{}, {}, { y: 1 }] }])).not.toBeNull();
  });

  it('refuses paths zdog would fail to draw', () => {
    const bad: Json[] = [
      [],
      [[]],
      ['x'],
      [{ line: [] }],
      [{ line: [{}, {}] }],
      [{ arc: [{}] }],
      [{ arc: {} }],
      [{ bezier: [{}, {}] }],
      [{ x: Infinity }],
      [{ x: '1' }],
      [{ w: 1 }],
      [{ x: 1, line: {} }],
      [{ line: { x: 1, w: 2 } }],
      JSON.parse('[{"__proto__": {}}]'),
      Array.from({ length: 2001 }, () => ({})),
      { length: 1, 0: {} },
    ];
    for (const path of bad) expect(readPath(path), JSON.stringify(path)).toBeNull();
  });

  it('builds fresh objects, so nothing else rides along', () => {
    const [point] = readPath(JSON.parse('[{"x": 1}]')) ?? [];
    expect(Object.getPrototypeOf(point!)).toBe(Object.prototype);
    const result = parseSceneFile(
      JSON.stringify({ version: SCENE_VERSION, shapes: [{ id: 'a', type: 'Shape', props: { path: [{ x: 1 }, { line: { y: 1 } }] } }] }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.shapes[0].props.path).toEqual([{ x: 1 }, { line: { y: 1 } }]);
  });
});

describe('messages about a file', () => {
  const errorOf = (data: unknown) => {
    const result = parseSceneFile(JSON.stringify(data));
    return result.ok ? null : result.error;
  };

  it('quote at most 40 characters of what the file holds, cleaned', () => {
    const error = errorOf({ version: SCENE_VERSION, shapes: [{ id: 'a', type: `‮${'x'.repeat(5000)}` }] }) ?? '';
    expect(error).toMatch(/unknown type: "x{40}…"/);
    expect(error).not.toContain('‮');
    expect(error.length).toBeLessThan(120);
    const version = errorOf({ version: 'y'.repeat(5000), shapes: [] }) ?? '';
    expect(version.length).toBeLessThan(120);
  });

  it('say what range a number must be in', () => {
    expect(errorOf({ version: SCENE_VERSION, shapes: [{ id: 'p', type: 'Polygon', props: { sides: 1e9 } }] })).toBe(
      'Shape 1: "sides" must be a whole number from 3 to 100.',
    );
    expect(errorOf({ version: SCENE_VERSION, shapes: [{ id: 'p', type: 'Polygon', tracks: { 'props.sides': [{ frame: 0, value: 1e9 }] } }] })).toMatch(
      /"props.sides" key at frame 0 has a value that doesn't fit/,
    );
  });
});
