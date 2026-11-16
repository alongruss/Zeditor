import { describe, expect, it } from 'vitest';
import { addCameraCommand, deleteObject, duplicate, edit, rename, toggleKey, type EditorState } from '../state/commands';
import { applyCommand, canUndo, startHistory, undo } from '../state/history';
import { editAtFrame, keyState, setKey } from './animation';
import { isAnimated, objectAtFrame, sceneAtFrame } from './evaluate';
import { deleteKeys, moveKeysInScene, retime } from './keyEdits';
import {
  addCamera,
  allObjects,
  createCamera,
  duplicateObject,
  emptyScene,
  findObject,
  removeObject,
} from './scene';
import { parseSceneFile, serializeScene } from './sceneFile';
import { starterScene } from './starterScene';
import { SCENE_VERSION, type CameraData, type Scene } from './types';

const VIEW = { rotate: { x: -20, y: 30, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: 32, width: 640, height: 360 };

const withCamera = (scene: Scene = starterScene()): Scene => addCamera(scene, createCamera(scene, VIEW));
const cameraOf = (scene: Scene, index = 0): CameraData => scene.cameras[index];

/** A camera turning from Angle Y 0 at frame 0 to 90 at frame 30, linearly. */
function turningCamera(): CameraData {
  const camera = createCamera(emptyScene(), VIEW);
  const keyed = setKey(setKey(camera, 'rotate.y', 0, 0), 'rotate.y', 30, 90);
  return { ...keyed, tracks: { 'rotate.y': keyed.tracks!['rotate.y'].map((key) => ({ ...key, easing: 'linear' as const })) } };
}

describe('cameras in the scene', () => {
  it('are numbered camera-1, camera-2, ... and never share an id with another object', () => {
    let scene = withCamera();
    scene = withCamera(scene);
    expect(scene.cameras.map((c) => [c.id, c.name])).toEqual([
      ['camera-1', 'Camera 1'],
      ['camera-2', 'Camera 2'],
    ]);
    expect(() => addCamera(scene, cameraOf(scene))).toThrow(/already in scene/);
    expect(findObject(scene, 'camera-2')).toBe(cameraOf(scene, 1));
    expect(allObjects(scene)).toHaveLength(scene.shapes.length + 2);
  });

  it('duplicate right after the original, with every field and key, and remove', () => {
    const scene = addCamera(emptyScene(), turningCamera());
    const { scene: copied, id } = duplicateObject(scene, 'camera-1');
    expect(id).toBe('camera-2');
    const copy = cameraOf(copied, 1);
    expect(copy).toEqual({ ...cameraOf(scene), id: 'camera-2', name: 'Camera 2' });
    expect(copy.tracks).not.toBe(cameraOf(scene).tracks); // a real copy, not shared
    expect(removeObject(copied, 'camera-1').cameras.map((c) => c.id)).toEqual(['camera-2']);
    expect(removeObject(copied, 'nothing')).toBe(copied);
  });
});

describe('animated cameras', () => {
  it('are posed on each frame, and count as animation', () => {
    const scene = addCamera(starterScene(), turningCamera());
    expect(objectAtFrame(cameraOf(scene), 15).rotate.y).toBeCloseTo(45);
    expect(sceneAtFrame(scene, 30).cameras[0].rotate.y).toBe(90);
    expect(isAnimated(scene)).toBe(true);
    expect(isAnimated(withCamera())).toBe(false);
    // Nothing changes before the first key, so the camera keeps its identity.
    const still = withCamera();
    expect(sceneAtFrame(still, 10).cameras[0]).toBe(cameraOf(still));
  });

  it('key only what changed; the picture size is never keyed', () => {
    const camera = turningCamera();
    const edited = editAtFrame(camera, { rotate: { x: 5, y: 60 }, viewSpan: 12, width: 1280 }, 10);
    expect(edited.tracks!['rotate.y'].map((k) => [k.frame, k.value])).toEqual([
      [0, 0],
      [10, 60],
      [30, 90],
    ]);
    // Not animated: these change on every frame.
    expect(edited.rotate.x).toBe(5);
    expect(edited.viewSpan).toBe(12);
    expect(edited.width).toBe(1280);
    expect(Object.keys(edited.tracks!)).toEqual(['rotate.y']);
  });
});

describe('camera commands', () => {
  const start = (): EditorState => ({ scene: starterScene(), selectedId: null });

  it('adds a camera from a view and selects it; Delete and Duplicate work on it', () => {
    const added = addCameraCommand(VIEW)(start());
    expect(added.selectedId).toBe('camera-1');
    expect(cameraOf(added.scene)).toMatchObject({ ...VIEW, type: 'Camera' });
    const twice = duplicate('camera-1')(added);
    expect(twice.selectedId).toBe('camera-2');
    const deleted = deleteObject('camera-1')(twice);
    expect(deleted.scene.cameras.map((c) => c.id)).toEqual(['camera-2']);
    expect(deleted.scene.shapes).toBe(twice.scene.shapes);
  });

  it('edits, keys and renames a camera', () => {
    let state = addCameraCommand(VIEW)(start());
    state = edit('camera-1', { target: { x: 2 } }, 0)(state);
    expect(cameraOf(state.scene).target).toEqual({ x: 2, y: 0, z: 0 });
    state = toggleKey('camera-1', ['viewSpan'], 0)(state);
    expect(keyState(cameraOf(state.scene), 'viewSpan', 0)).toBe('key');
    state = rename('camera-1', 'Hero shot')(state);
    expect(cameraOf(state.scene).name).toBe('Hero shot');
  });

  it('a change to a camera is one undo step; no change is none', () => {
    const scene = withCamera();
    let history = startHistory({ scene, selectedId: null });
    history = applyCommand(history, edit('camera-1', { viewSpan: 32 }, 0)); // the same value
    expect(canUndo(history)).toBe(false);
    history = applyCommand(history, edit('camera-1', { viewSpan: 10 }, 0));
    expect(canUndo(history)).toBe(true);
    expect(cameraOf(undo(history).present.scene).viewSpan).toBe(32);
  });
});

describe('camera keys in the timeline', () => {
  const scene = addCamera(emptyScene(), turningCamera());
  const ref = (frame: number) => ({ objectId: 'camera-1', path: 'rotate.y', frame });

  it('move and delete', () => {
    const moved = moveKeysInScene(scene, scene.cameras, [ref(30)], 10);
    expect(cameraOf(moved).tracks!['rotate.y'].map((k) => k.frame)).toEqual([0, 40]);
    const deleted = deleteKeys(scene, [ref(0)]);
    expect(cameraOf(deleted).tracks!['rotate.y'].map((k) => k.frame)).toEqual([30]);
  });

  it('keep their timing when the frame rate changes', () => {
    const at60 = retime({ ...scene, settings: { ...scene.settings, fps: 30 } }, 60);
    expect(cameraOf(at60).tracks!['rotate.y'].map((k) => k.frame)).toEqual([0, 60]);
  });
});

describe('camera files (version 3)', () => {
  it('save then open gives back the cameras and their keys', () => {
    const scene = addCamera(withCamera(), { ...turningCamera(), id: 'camera-9', name: 'Turning' });
    expect(parseSceneFile(serializeScene(scene))).toEqual({ ok: true, scene });
  });

  it('opens older files with no cameras', () => {
    const v2 = { version: 2, settings: { background: '#ffffff', fps: 24, duration: 48 }, shapes: [], cameras: [{}] };
    const result = parseSceneFile(JSON.stringify(v2));
    expect(result.ok && result.scene.cameras).toEqual([]);
  });

  const fileWith = (camera: Record<string, unknown>, shapes: unknown[] = []) =>
    JSON.stringify({
      version: SCENE_VERSION,
      settings: { background: '#ffffff' },
      shapes,
      cameras: [{ ...createCamera(emptyScene(), VIEW), ...camera }],
    });
  const errorOf = (text: string) => {
    const result = parseSceneFile(text);
    return result.ok ? null : result.error;
  };

  it('refuses broken cameras with a clear message', () => {
    expect(errorOf(fileWith({ viewSpan: 0 }))).toMatch(/Camera 1: the view span must be a number above 0/);
    expect(errorOf(fileWith({ width: 1.5 }))).toMatch(/Camera 1: the picture width must be a whole number/);
    expect(errorOf(fileWith({ height: 100000 }))).toMatch(/picture height/);
    expect(errorOf(fileWith({ id: '../x' }))).toMatch(/Camera 1 has no valid id/);
    expect(errorOf(fileWith({ rotate: { x: 'a', y: 0, z: 0 } }))).not.toBeNull();
    // Only a camera's own properties can be animated.
    expect(errorOf(fileWith({ tracks: { 'props.color': [{ frame: 0, value: '#000000', easing: 'linear' }] } }))).not.toBeNull();
    expect(
      errorOf(fileWith({ id: 'box-1' }, [{ id: 'box-1', name: 'Box 1', type: 'Box' }])),
    ).toMatch(/Two objects have the same id: box-1/);
    expect(errorOf(JSON.stringify({ version: SCENE_VERSION, settings: {}, shapes: [], cameras: {} }))).toMatch(
      /cameras aren't a list/,
    );
  });
});
