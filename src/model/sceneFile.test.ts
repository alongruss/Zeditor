import { describe, expect, it } from 'vitest';
import { createShape, emptyScene, updateShape } from './scene';
import { isSafeColor, parseSceneFile, serializeScene } from './sceneFile';
import { starterScene } from './starterScene';
import { SCENE_VERSION, type Scene } from './types';

const parse = (data: unknown) => parseSceneFile(JSON.stringify(data));
const errorOf = (data: unknown) => {
  const result = typeof data === 'string' ? parseSceneFile(data) : parse(data);
  return result.ok ? null : result.error;
};
const sceneOf = (data: unknown): Scene => {
  const result = parse(data);
  if (!result.ok) throw new Error(result.error);
  return result.scene;
};
const fileWith = (shape: Record<string, unknown>) => ({
  version: SCENE_VERSION,
  settings: { background: '#ffffff' },
  shapes: [{ id: 'box-1', name: 'Box 1', type: 'Box', ...shape }],
});

describe('scene files', () => {
  it('save then open gives back the same scene', () => {
    let scene = starterScene();
    scene = updateShape(scene, 'cone-1', { rotate: { x: 30 }, opacity: 0.5, props: { backface: '#cc22554d' } });
    expect(parseSceneFile(serializeScene(scene))).toEqual({ ok: true, scene });
    expect(parseSceneFile(serializeScene(emptyScene()))).toEqual({ ok: true, scene: emptyScene() });
  });

  it('keeps 0 and false values', () => {
    const scene = sceneOf(fileWith({ props: { stroke: 0, fill: false, frontFace: false } }));
    expect(scene.shapes[0].props).toMatchObject({ stroke: 0, fill: false, frontFace: false });
  });

  it('refuses files that are not scenes, with a clear message', () => {
    expect(errorOf('not json')).toMatch(/isn't a Zeditor scene file.*valid JSON/);
    expect(errorOf([])).toMatch(/isn't a Zeditor scene file/);
    expect(errorOf({ version: 1 })).toMatch(/isn't a Zeditor scene file/);
    expect(errorOf({ version: 'one', shapes: [] })).toMatch(/Unknown file version/);
  });

  it('says so when a file is from a newer version', () => {
    expect(errorOf({ version: SCENE_VERSION + 1, shapes: [] })).toMatch(/newer version of Zeditor \(file version 2\)/);
  });

  it('refuses unknown shape types, bad ids and duplicate ids', () => {
    expect(errorOf(fileWith({ type: 'Teapot' }))).toMatch(/Shape 1 has an unknown type: "Teapot"/);
    expect(errorOf(fileWith({ id: '"><img src=x>' }))).toMatch(/no valid id/);
    const twice = fileWith({});
    expect(errorOf({ ...twice, shapes: [...twice.shapes, ...twice.shapes] })).toMatch(/same id: box-1/);
  });

  it('refuses values of the wrong kind', () => {
    expect(errorOf(fileWith({ translate: { x: 'far' } }))).toMatch(/translate\.x isn't a number/);
    expect(errorOf(fileWith({ props: { width: -5 } }))).toMatch(/"width"/);
    expect(errorOf(fileWith({ props: { fill: 'yes' } }))).toMatch(/"fill"/);
    expect(errorOf(fileWith({ scale: 'big' }))).toMatch(/scale/);
    const polygon = { version: 1, shapes: [{ id: 'polygon-1', type: 'Polygon', props: { sides: 3.5 } }] };
    expect(errorOf(polygon)).toMatch(/"sides"/);
  });

  it('fills in missing settings and drops unknown ones', () => {
    const text = `{"version": 1, "settings": {"background": "url(https://example.com/x.png)"},
      "shapes": [{"id": "box-1", "type": "Box",
        "props": {"width": 2, "onload": "alert(1)", "__proto__": {"polluted": true}}}]}`;
    const result = parseSceneFile(text);
    if (!result.ok) throw new Error(result.error);
    const box = result.scene.shapes[0];
    expect(result.scene.settings.background).toBe('#ffddbb');
    expect(box.name).toBe('box-1');
    expect(box.props.width).toBe(2);
    expect(box.props.height).toBe(createShape(emptyScene(), 'Box').props.height);
    expect(Object.keys(box.props)).not.toContain('onload');
    expect(Object.keys(box.props)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(box.translate).toEqual({ x: 0, y: 0, z: 0 });
    expect(box.opacity).toBe(1);
  });

  it('keeps opacity between 0 and 1', () => {
    expect(sceneOf(fileWith({ opacity: 3 })).shapes[0].opacity).toBe(1);
    expect(sceneOf(fileWith({ opacity: -1 })).shapes[0].opacity).toBe(0);
  });

  it('accepts zdog paths made of numbers only', () => {
    const path = [{ x: 0 }, { arc: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }, { move: { z: 2 } }, {}];
    const scene = sceneOf({ version: 1, shapes: [{ id: 'shape-1', type: 'Shape', props: { path } }] });
    expect(scene.shapes[0].props.path).toEqual(path);
    const bad = { version: 1, shapes: [{ id: 'shape-1', type: 'Shape', props: { path: [{ x: 'a' }] } }] };
    expect(errorOf(bad)).toMatch(/"path"/);
  });
});

describe('isSafeColor', () => {
  it('accepts hex, names and rgb()/hsl(), and nothing that could load or run anything', () => {
    for (const ok of ['#abc', '#33AA6633', 'red', 'transparent', 'rgba(1, 2, 3, 0.5)', 'hsl(120, 50%, 50%)']) {
      expect(isSafeColor(ok), ok).toBe(true);
    }
    for (const bad of ['url(https://x.test/a.png)', 'red; fill: url(#x)', 'javascript:alert(1)', '"red"', 7, null]) {
      expect(isSafeColor(bad), String(bad)).toBe(false);
    }
  });
});
