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
    expect(errorOf({ version: SCENE_VERSION + 1, shapes: [] })).toContain(
      `newer version of Zeditor (file version ${SCENE_VERSION + 1})`,
    );
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

describe('scene files with animation (version 2)', () => {
  const animatedFile = (tracks: unknown, settings: Record<string, unknown> = {}) => ({
    version: 2,
    settings: { background: '#ffffff', ...settings },
    shapes: [{ id: 'box-1', name: 'Box 1', type: 'Box', tracks }],
  });
  const goodTracks = {
    'translate.x': [
      { frame: 30, value: 5, easing: 'easeOut' },
      { frame: 0, value: 0, easing: 'linear' },
    ],
    'props.color': [{ frame: 0, value: '#ff0000', easing: 'hold' }],
    'props.fill': [{ frame: 10, value: false, easing: 'linear' }],
  };

  it('opens version 1 files, with the default fps and length and no animation', () => {
    const scene = sceneOf({ version: 1, shapes: [{ id: 'box-1', type: 'Box', tracks: goodTracks }] });
    expect(scene.version).toBe(SCENE_VERSION);
    expect(scene.settings).toMatchObject({ fps: 30, duration: 90 });
    expect(scene.shapes[0].tracks).toBeUndefined();
  });

  it('save then open keeps the animation, with keys in frame order', () => {
    const scene = sceneOf(animatedFile(goodTracks, { fps: 24, duration: 48 }));
    expect(scene.settings).toMatchObject({ fps: 24, duration: 48 });
    expect(scene.shapes[0].tracks!['translate.x'].map((k) => k.frame)).toEqual([0, 30]);
    expect(parseSceneFile(serializeScene(scene))).toEqual({ ok: true, scene });
  });

  it('keeps custom easing curves', () => {
    const tracks = { 'translate.x': [{ frame: 0, value: 0, easing: [0.3, -0.6, 0.7, 1.6] }, { frame: 20, value: 5 }] };
    const scene = sceneOf(animatedFile(tracks));
    expect(scene.shapes[0].tracks!['translate.x'][0].easing).toEqual([0.3, -0.6, 0.7, 1.6]);
    expect(parseSceneFile(serializeScene(scene))).toEqual({ ok: true, scene });
  });

  it('refuses tracks that do not fit their property', () => {
    const one = (path: string, keyframe: Record<string, unknown>) => errorOf(animatedFile({ [path]: [keyframe] }));
    expect(one('props.wings', { frame: 0, value: 1 })).toMatch(/"props.wings" can't be animated/);
    expect(one('translate.x', { frame: -1, value: 1 })).toMatch(/no valid frame/);
    expect(one('translate.x', { frame: 1.5, value: 1 })).toMatch(/no valid frame/);
    expect(one('opacity', { frame: 0, value: 2 })).toMatch(/doesn't fit/);
    expect(one('props.color', { frame: 0, value: 'url(x.png)' })).toMatch(/doesn't fit/);
    expect(one('props.fill', { frame: 0, value: 'yes' })).toMatch(/doesn't fit/);
    expect(one('scale', { frame: 0, value: 1, easing: 'bounce' })).toMatch(/unknown easing/);
    expect(one('scale', { frame: 0, value: 1, easing: [1.5, 0, 0.5, 1] })).toMatch(/unknown easing/);
    expect(errorOf(animatedFile({ scale: [] }))).toMatch(/no keys/);
    const twice = { scale: [{ frame: 3, value: 1 }, { frame: 3, value: 2 }] };
    expect(errorOf(animatedFile(twice))).toMatch(/two "scale" keys are on frame 3/);
  });

  it('refuses a bad fps or length', () => {
    expect(errorOf(animatedFile(undefined, { fps: 0 }))).toMatch(/fps must be a whole number/);
    expect(errorOf(animatedFile(undefined, { duration: 2.5 }))).toMatch(/length must be a whole number/);
  });
});
