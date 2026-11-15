import { useCallback } from 'preact/hooks';
import { chooseSceneFile, exportScript, saveScene } from '../files/sceneFiles';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import { addCameraCommand, addShapeOfType, deleteObject, duplicate, newScene } from '../state/commands';
import { lookedThroughCamera } from '../state/currentView';
import { closeLottieDialog, openLottieDialog, useLottieDialogOpen } from '../state/dialogs';
import {
  dispatch,
  freeView,
  redo,
  setLookThrough,
  undo,
  useEditorState,
  useLookThrough,
  useUndoAvailability,
} from '../state/store';
import { viewportSize, useViewportSize } from '../state/viewportSize';
import { VIEW_SPAN } from '../viewport/fitZoom';
import { Dropdown } from './Dropdown';
import { ExportLottieDialog } from './ExportLottieDialog';

/*
 * The editor's commands, as pieces the panels place: File, Undo and Redo in
 * the Scene panel's header; Add at the top of the Scene panel; View, Export,
 * Duplicate and Delete in the Inspector's header. (Reset view and zoom live
 * on the scene: see viewport/ZoomControls.tsx.)
 */

export const NEW_SCENE_PROMPT = 'Start a new, empty scene? You can undo this with Ctrl+Z.';

/** Asks first, then empties the scene (undoable). */
export function confirmNewScene(): void {
  if (window.confirm(NEW_SCENE_PROMPT)) dispatch(newScene);
}

export function FileMenu() {
  return (
    <Dropdown
      label="File"
      menuLabel="File"
      items={[
        { label: 'New scene', onSelect: confirmNewScene },
        { label: 'Open…', shortcut: 'Ctrl+O', onSelect: chooseSceneFile },
        { label: 'Save', shortcut: 'Ctrl+S', onSelect: saveScene },
        { label: 'Export Zdog JS', onSelect: () => void exportScript() },
        { label: 'Export Lottie…', onSelect: openLottieDialog },
      ]}
    />
  );
}

/** A second way to the two exports, next to what you are editing. */
export function ExportMenu() {
  return (
    <Dropdown
      label="Export"
      menuLabel="Export"
      primary
      items={[
        { label: 'Lottie animation…', onSelect: openLottieDialog },
        { label: 'Zdog JS script', onSelect: () => void exportScript() },
      ]}
    />
  );
}

export function UndoRedoButtons() {
  const { canUndo, canRedo } = useUndoAvailability();
  return (
    <>
      <button type="button" class="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 4L2.5 6.5 5 9" />
          <path d="M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7" />
        </svg>
      </button>
      <button type="button" class="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11 4l2.5 2.5L11 9" />
          <path d="M13 6.5H6.5a3.5 3.5 0 0 0 0 7H9" />
        </svg>
      </button>
    </>
  );
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * A new camera's view: the camera being looked through, or the free view
 * (same angle and zoom, aimed at the origin), with the viewport's size.
 */
function newCameraView() {
  const through = lookedThroughCamera();
  if (through) return through;
  const free = freeView.get();
  const size = viewportSize.get();
  return {
    rotate: { x: free.rotate.x * RAD_TO_DEG, y: free.rotate.y * RAD_TO_DEG, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    viewSpan: VIEW_SPAN / free.zoom,
    width: Math.max(1, Math.round(size?.width ?? 640)),
    height: Math.max(1, Math.round(size?.height ?? 480)),
  };
}

/** The big Add button at the top of the Scene panel: every shape type, then Camera. */
export function AddMenu() {
  return (
    <Dropdown
      label="Add"
      menuLabel="Add"
      className="add-menu"
      icon={
        <svg viewBox="0 0 16 16">
          <path d="M8 3v10M3 8h10" />
        </svg>
      }
      items={[
        ...SHAPE_TYPES.map((type) => ({
          label: SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label,
          onSelect: () => dispatch(addShapeOfType(type)),
        })),
        { label: 'Camera', onSelect: () => dispatch(addCameraCommand(newCameraView())) },
      ]}
    />
  );
}

/** Look through a camera, or use the free view. */
export function ViewMenu() {
  const { scene } = useEditorState();
  const lookingThrough = useLookThrough();
  const viewing = scene.cameras.some((c) => c.id === lookingThrough) ? lookingThrough : null;
  return (
    <select
      class="view-menu"
      aria-label="View"
      title="Look through a camera, or use the free view"
      value={viewing ?? ''}
      onChange={(event) => setLookThrough(event.currentTarget.value || null)}
    >
      <option value="">Free view</option>
      {scene.cameras.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

/** Duplicate and Delete for the selection. */
export function SelectionButtons() {
  const { selectedId } = useEditorState();
  const hasSelection = selectedId !== null;
  return (
    <>
      <button type="button" disabled={!hasSelection} onClick={() => selectedId && dispatch(duplicate(selectedId))}>
        Duplicate
      </button>
      <button type="button" disabled={!hasSelection} onClick={() => selectedId && dispatch(deleteObject(selectedId))}>
        Delete
      </button>
    </>
  );
}

/** The Export Lottie dialog, while open (from File ▾ or Export ▾). */
export function Dialogs() {
  const lottieOpen = useLottieDialogOpen();
  const size = useViewportSize();
  const lookingThrough = useLookThrough();
  const { scene } = useEditorState();
  const close = useCallback(() => closeLottieDialog(), []);
  if (!lottieOpen) return null;
  const viewing = scene.cameras.some((c) => c.id === lookingThrough) ? lookingThrough : null;
  return (
    <ExportLottieDialog
      defaultWidth={size?.width ?? 512}
      defaultHeight={size?.height ?? 512}
      defaultCamera={viewing}
      onClose={close}
    />
  );
}
