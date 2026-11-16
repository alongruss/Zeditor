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
import { groupObjects, setParent, ungroup, type GroupResult } from '../model/groups';
import { childrenOf, topmost } from '../model/hierarchy';
import { deleteKeys, moveKeysInScene, retime, setKeysEasing, type KeyRef } from '../model/keyEdits';
import type { Easing, PropertyPath, Scene, SceneObject, ShapeType, Vec3 } from '../model/types';

/** Everything the editor knows. The UI and the 3D view are drawn from this alone. */
export interface EditorState {
  readonly scene: Scene;
  /**
   * The object the Inspector, gizmo and timeline show: the one picked last.
   * Always one of `selectedIds` (null when nothing is selected).
   */
  readonly selectedId: string | null;
  /** Everything selected, in the order it was picked. */
  readonly selectedIds: readonly string[];
}

type Selection = Pick<EditorState, 'selectedId' | 'selectedIds'>;

/** A selection of just this object (or of nothing). */
export function only(id: string | null): Selection {
  return { selectedId: id, selectedIds: id === null ? [] : [id] };
}

/** A selection of these objects, the last one shown in the Inspector. */
function many(ids: readonly string[]): Selection {
  const unique = [...new Set(ids)];
  return { selectedId: unique[unique.length - 1] ?? null, selectedIds: unique };
}

const sameSelection = (state: EditorState, next: Selection) =>
  state.selectedId === next.selectedId &&
  state.selectedIds.length === next.selectedIds.length &&
  state.selectedIds.every((id, i) => id === next.selectedIds[i]);

/** The selected objects that still exist, in the order they were picked. */
export function selectionOf(state: EditorState): string[] {
  return state.selectedIds.filter((id) => findObject(state.scene, id));
}

/**
 * Commands are pure functions from one state to the next. They return the
 * same object when nothing changes, so subscribers can skip work.
 */
export type Command = (state: EditorState) => EditorState;

export const select =
  (id: string | null): Command =>
  (state) => {
    const next = only(id !== null && findObject(state.scene, id) ? id : null);
    return sameSelection(state, next) ? state : { ...state, ...next };
  };

/** Ctrl-click: adds an object to the selection, or takes it out if it's already in. */
export const toggleSelect =
  (id: string): Command =>
  (state) => {
    if (!findObject(state.scene, id)) return state;
    const ids = selectionOf(state);
    return { ...state, ...many(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]) };
  };

/** Selects these objects (those that exist), the last one shown in the Inspector. */
export const selectMany =
  (ids: readonly string[]): Command =>
  (state) => {
    const next = many(ids.filter((id) => findObject(state.scene, id)));
    return sameSelection(state, next) ? state : { ...state, ...next };
  };

/** Ctrl+A: everything at the top level (groups bring their insides) and every camera. */
export const selectAll: Command = (state) =>
  selectMany([...childrenOf(state.scene, null).map((o) => o.id), ...state.scene.cameras.map((c) => c.id)])(state);

/** Adds a shape (at the origin, or at `at`) and selects it. */
export const addShapeOfType =
  (type: ShapeType, at?: Vec3): Command =>
  (state) => {
    const shape = createShape(state.scene, type, at);
    return { scene: addShape(state.scene, shape), ...only(shape.id) };
  };

/** Deletes a shape, group (with its insides) or camera. */
export const deleteObject = (id: string): Command => deleteObjects([id]);

/** Deletes these objects (groups with their insides); what's left of the selection stays selected. */
export const deleteObjects =
  (ids: readonly string[]): Command =>
  (state) => {
    const scene = ids.reduce(removeObject, state.scene);
    if (scene === state.scene) return state;
    return { scene, ...many(state.selectedIds.filter((id) => findObject(scene, id))) };
  };

export const duplicate = (id: string): Command => duplicateObjects([id]);

/** Copies these objects (a group with its insides), each in place, and selects the copies. */
export const duplicateObjects =
  (ids: readonly string[]): Command =>
  (state) => {
    let scene = state.scene;
    const copies: string[] = [];
    for (const id of topmost(scene, ids)) {
      const result = duplicateObject(scene, id);
      if (result.id === null) continue;
      scene = result.scene;
      copies.push(result.id);
    }
    return copies.length === 0 ? state : { scene, ...many(copies) };
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

/** Applies a grouping change and selects what it says (unchanged if it was refused). */
function fromGroupResult(state: EditorState, result: GroupResult): EditorState {
  if (result.scene === state.scene) return state;
  return result.id === null ? { ...state, scene: result.scene } : { scene: result.scene, ...only(result.id) };
}

const idList = (ids: string | readonly string[]): readonly string[] => (typeof ids === 'string' ? [ids] : ids);

/** Wraps shapes and groups in one new group, each in its place, and selects the new group. */
export const groupCommand =
  (ids: string | readonly string[]): Command =>
  (state) =>
    fromGroupResult(state, groupObjects(state.scene, idList(ids)));

/** Takes groups' insides out into their parents and removes the groups; selects what was inside. */
export const ungroupCommand =
  (ids: string | readonly string[]): Command =>
  (state) => {
    let scene = state.scene;
    const freed: string[] = [];
    for (const id of idList(ids)) {
      const inside = childrenOf(scene, id).map((o) => o.id);
      const result = ungroup(scene, id);
      if (result.scene === scene) continue;
      scene = result.scene;
      freed.push(...inside);
    }
    return scene === state.scene ? state : { scene, ...many(freed) };
  };

/** Moves a shape or group into another group (null: the top level), keeping its place. */
export const setParentCommand =
  (id: string, parentId: string | null): Command =>
  (state) =>
    fromGroupResult(state, setParent(state.scene, id, parentId));

/** Adds a camera (see createCamera) and selects it. */
export const addCameraCommand =
  (view: Parameters<typeof createCamera>[1]): Command =>
  (state) => {
    const camera = createCamera(state.scene, view);
    return { scene: addCamera(state.scene, camera), ...only(camera.id) };
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
/** One gizmo drag moving several objects: each edit as `edit` would make it, as one change. */
export const editMany =
  (edits: readonly { readonly id: string; readonly patch: ObjectPatch }[], frame: number): Command =>
  (state) => {
    const changed = new Map<string, SceneObject>();
    for (const { id, patch } of edits) {
      const before = changed.get(id) ?? findObject(state.scene, id);
      if (!before) continue;
      const after = editAtFrame(before, patch, frame);
      if (after !== before) changed.set(id, after);
    }
    return changed.size === 0 ? state : { ...state, scene: replaceObjects(state.scene, changed) };
  };

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

export const newScene: Command = () => ({ scene: emptyScene(), ...only(null) });

/** Replaces the whole scene, e.g. with one opened from a file. Can be undone like any change. */
export const loadScene =
  (scene: Scene): Command =>
  () => ({ scene, ...only(null) });
