import {
  addShape,
  createShape,
  duplicateShape,
  emptyScene,
  findShape,
  removeShape,
  updateShape,
  type ShapePatch,
} from '../model/scene';
import type { Scene, ShapeType } from '../model/types';

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
    const nextId = id !== null && findShape(state.scene, id) ? id : null;
    return nextId === state.selectedId ? state : { ...state, selectedId: nextId };
  };

export const addShapeOfType =
  (type: ShapeType): Command =>
  (state) => {
    const shape = createShape(state.scene, type);
    return { scene: addShape(state.scene, shape), selectedId: shape.id };
  };

export const deleteShape =
  (id: string): Command =>
  (state) => {
    const scene = removeShape(state.scene, id);
    if (scene === state.scene) return state;
    return { scene, selectedId: state.selectedId === id ? null : state.selectedId };
  };

export const duplicate =
  (id: string): Command =>
  (state) => {
    const result = duplicateShape(state.scene, id);
    return result.id === null ? state : { scene: result.scene, selectedId: result.id };
  };

export const update =
  (id: string, patch: ShapePatch): Command =>
  (state) => {
    const scene = updateShape(state.scene, id, patch);
    return scene === state.scene ? state : { ...state, scene };
  };

export const rename =
  (id: string, name: string): Command =>
  (state) => {
    const trimmed = name.trim();
    const shape = findShape(state.scene, id);
    if (!shape || trimmed === '' || trimmed === shape.name) return state;
    return update(id, { name: trimmed })(state);
  };

export const newScene: Command = () => ({ scene: emptyScene(), selectedId: null });

/** Replaces the whole scene, e.g. with one opened from a file. Can be undone like any change. */
export const loadScene =
  (scene: Scene): Command =>
  () => ({ scene, selectedId: null });
