import {
  addCamera,
  addShape,
  createCamera,
  createShape,
  duplicateObject,
  emptyScene,
  findObject,
  removeObject,
  replaceObjects,
  updateShape,
  type ShapePatch,
} from '../model/scene';
import { editAtFrame, toggleKeys, type ObjectPatch } from '../model/animation';
import { deleteKeys, moveKeysInScene, retime, setKeysEasing, type KeyRef } from '../model/keyEdits';
import type { Easing, PropertyPath, Scene, SceneObject, ShapeType, Vec3 } from '../model/types';

/** Everything the editor knows. The UI and the 3D view are drawn from this alone. */
export interface EditorState {
  readonly scene: Scene;
  /** The one selected shape, or null. */
  readonly selectedId: string | null;
}

/**
 * Commands are pure functions from one state to the next. They return the
 * same object when nothing changes, so subscribers can skip work.
 */
export type Command = (state: EditorState) => EditorState;

export const select =
  (id: string | null): Command =>
  (state) => {
    const nextId = id !== null && findObject(state.scene, id) ? id : null;
    return nextId === state.selectedId ? state : { ...state, selectedId: nextId };
  };

/** Adds a shape (at the origin, or at `at`) and selects it. */
export const addShapeOfType =
  (type: ShapeType, at?: Vec3): Command =>
  (state) => {
    const shape = createShape(state.scene, type, at);
    return { scene: addShape(state.scene, shape), selectedId: shape.id };
  };

/** Deletes a shape or a camera. */
export const deleteObject =
  (id: string): Command =>
  (state) => {
    const scene = removeObject(state.scene, id);
    if (scene === state.scene) return state;
    return { scene, selectedId: state.selectedId === id ? null : state.selectedId };
  };

export const duplicate =
  (id: string): Command =>
  (state) => {
    const result = duplicateObject(state.scene, id);
    return result.id === null ? state : { scene: result.scene, selectedId: result.id };
  };

export const update =
  (id: string, patch: ShapePatch): Command =>
  (state) => {
    const scene = updateShape(state.scene, id, patch);
    return scene === state.scene ? state : { ...state, scene };
  };

/** Replaces one shape or camera with a changed version of itself (by id). */
function withObject(state: EditorState, id: string, change: (object: SceneObject) => SceneObject): EditorState {
  const before = findObject(state.scene, id);
  if (!before) return state;
  const after = change(before);
  if (after === before) return state;
  return { ...state, scene: replaceObjects(state.scene, new Map([[id, after]])) };
}

/** Adds a camera (see createCamera) and selects it. */
export const addCameraCommand =
  (view: Parameters<typeof createCamera>[1]): Command =>
  (state) => {
    const camera = createCamera(state.scene, view);
    return { scene: addCamera(state.scene, camera), selectedId: camera.id };
  };

/**
 * An edit made with the playhead on `frame` (from the Inspector or the
 * gizmo): animated properties get a key there, others change everywhere.
 * See model/animation.ts editAtFrame.
 */
export const edit =
  (id: string, patch: ObjectPatch, frame: number): Command =>
  (state) =>
    withObject(state, id, (object) => editAtFrame(object, patch, frame));

/** The keyframe button: keys these properties at `frame`, or removes their keys there. */
export const toggleKey =
  (id: string, paths: readonly PropertyPath[], frame: number): Command =>
  (state) =>
    withObject(state, id, (object) => toggleKeys(object, paths, frame));

/** Sets the frame rate and/or the length (in frames). Keys are not moved or removed. */
export const setTiming =
  (timing: { readonly fps?: number; readonly duration?: number }): Command =>
  (state) => {
    const { settings } = state.scene;
    const fps = timing.fps ?? settings.fps;
    const duration = timing.duration ?? settings.duration;
    if (fps === settings.fps && duration === settings.duration) return state;
    return { ...state, scene: { ...state.scene, settings: { ...settings, fps, duration } } };
  };

const withScene = (state: EditorState, scene: Scene): EditorState =>
  scene === state.scene ? state : { ...state, scene };

/**
 * Moves keys `delta` frames, from where they were when the drag began
 * (`origin`), so one drag is one undo step however far it goes back and forth.
 */
export const moveKeysCommand =
  (origin: readonly SceneObject[], refs: readonly KeyRef[], delta: number): Command =>
  (state) =>
    withScene(state, moveKeysInScene(state.scene, origin, refs, delta));

export const deleteKeysCommand =
  (refs: readonly KeyRef[]): Command =>
  (state) =>
    withScene(state, deleteKeys(state.scene, refs));

export const setEasingCommand =
  (refs: readonly KeyRef[], easing: Easing): Command =>
  (state) =>
    withScene(state, setKeysEasing(state.scene, refs, easing));

/** A new frame rate that keeps the animation's timing in seconds (keys and length are rescaled). */
export const retimeCommand =
  (fps: number): Command =>
  (state) =>
    withScene(state, retime(state.scene, fps));

export const rename =
  (id: string, name: string): Command =>
  (state) => {
    const trimmed = name.trim();
    const object = findObject(state.scene, id);
    if (!object || trimmed === '' || trimmed === object.name) return state;
    return withObject(state, id, (o) => ({ ...o, name: trimmed }));
  };

export const newScene: Command = () => ({ scene: emptyScene(), selectedId: null });

/** Replaces the whole scene, e.g. with one opened from a file. Can be undone like any change. */
export const loadScene =
  (scene: Scene): Command =>
  () => ({ scene, selectedId: null });
