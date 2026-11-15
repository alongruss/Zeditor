import { useCallback } from 'preact/hooks';
import { chooseSceneFile, exportScript, saveScene } from '../files/sceneFiles';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import { addCameraCommand, addShapeOfType, newScene } from '../state/commands';
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
import { setTheme, useTheme } from '../state/theme';
import { viewportSize, useViewportSize } from '../state/viewportSize';
import { VIEW_SPAN } from '../viewport/fitZoom';
import { Dropdown } from './Dropdown';
import { ExportLottieDialog } from './ExportLottieDialog';
import { STICKER, shapeTileSvg } from './shapeTiles';

/*
 * The editor's commands, as pieces the panels place: File, Undo and Redo in
 * the Scene panel's header; Add at the top of the Scene panel; View and
 * Export in the Inspector's header. (Duplicate and Delete sit next to the
 * selection, and zoom on the scene: see viewport/ContextToolbar.tsx and
 * viewport/ZoomControls.tsx.)
 */

export const NEW_SCENE_PROMPT = 'Start a new, empty scene? You can undo this with Ctrl+Z.';

/** Asks first, then empties the scene (undoable). */
export function confirmNewScene(): void {
  if (window.confirm(NEW_SCENE_PROMPT)) dispatch(newScene);
}

export function FileMenu() {
  const theme = useTheme();
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
        { label: 'Theme: match system', checked: theme === 'system', onSelect: () => setTheme('system') },
        { label: 'Theme: light', checked: theme === 'light', onSelect: () => setTheme('light') },
        { label: 'Theme: dark', checked: theme === 'dark', onSelect: () => setTheme('dark') },
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

/** A camera's picture in the Add menu: its frame, with the notch on top. */
const CAMERA_ART = (
  <svg viewBox="0 0 54 54" class="tile-camera">
    <rect x="8" y="14" width="38" height="26" rx="3" />
    <path d="M21 14 L27 8 L33 14" />
  </svg>
);

/**
 * The big Add button at the top of the Scene panel: a picture of every shape
 * type (drawn by zdog), then Camera. A real menu with the same item names as
 * before, so it reads the same to a screen reader.
 */
export function AddMenu() {
  return (
    <Dropdown
      label="Add"
      menuLabel="Add"
      className="add-menu"
      columns={3}
      icon={
        <svg viewBox="0 0 16 16">
          <path d="M8 3v10M3 8h10" />
        </svg>
      }
      items={[
        ...SHAPE_TYPES.map((type) => ({
          label: SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label,
          group: 'Shapes',
          tileColor: STICKER[type],
          // Our own zdog drawing of the type's default shape, never user input.
          art: <span class="tile-svg" dangerouslySetInnerHTML={{ __html: shapeTileSvg(type) }} />,
          onSelect: () => dispatch(addShapeOfType(type)),
        })),
        {
          label: 'Camera',
          group: 'Cameras',
          tileColor: STICKER.Camera,
          art: CAMERA_ART,
          onSelect: () => dispatch(addCameraCommand(newCameraView())),
        },
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
