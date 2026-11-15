import { chooseSceneFile, exportScript, saveScene } from '../files/sceneFiles';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import { addCameraCommand, addShapeOfType, deleteObject, duplicate, newScene } from '../state/commands';
import { lookedThroughCamera } from '../state/currentView';
import {
  dispatch,
  redo,
  setFreeView,
  setLookThrough,
  undo,
  useEditorState,
  useFreeView,
  useLookThrough,
  useUndoAvailability,
} from '../state/store';
import { DEFAULT_FREE_VIEW, isDefaultFreeView, type FreeView } from '../viewport/freeView';
import { VIEW_SPAN } from '../viewport/fitZoom';
import { useCallback, useState } from 'preact/hooks';
import { Dropdown } from './Dropdown';
import { ExportLottieDialog } from './ExportLottieDialog';

export const NEW_SCENE_PROMPT = 'Start a new, empty scene? You can undo this with Ctrl+Z.';

/** Asks first, then empties the scene (undoable). */
export function confirmNewScene(): void {
  if (window.confirm(NEW_SCENE_PROMPT)) dispatch(newScene);
}

interface ToolbarProps {
  /** The viewport's size in pixels, the default size for exported pictures. */
  readonly viewSize: { readonly width: number; readonly height: number } | null;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * A new camera's view: the camera being looked through, or the free view
 * (same angle and zoom, aimed at the origin), with the viewport's size.
 */
function newCameraView(free: FreeView, viewSize: ToolbarProps['viewSize']) {
  const through = lookedThroughCamera();
  if (through) return through;
  return {
    rotate: { x: free.rotate.x * RAD_TO_DEG, y: free.rotate.y * RAD_TO_DEG, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    viewSpan: VIEW_SPAN / free.zoom,
    width: Math.max(1, Math.round(viewSize?.width ?? 640)),
    height: Math.max(1, Math.round(viewSize?.height ?? 480)),
  };
}

/** Floating toolbar over the viewport: File, Add, View, Duplicate, Delete, Undo, Redo, Reset view. */
export function Toolbar({ viewSize }: ToolbarProps) {
  const { scene, selectedId } = useEditorState();
  const { canUndo, canRedo } = useUndoAvailability();
  const camera = useFreeView();
  const lookingThrough = useLookThrough();
  const viewing = scene.cameras.some((c) => c.id === lookingThrough) ? lookingThrough : null;
  const hasSelection = selectedId !== null;
  const [lottieOpen, setLottieOpen] = useState(false);
  const closeLottie = useCallback(() => setLottieOpen(false), []);

  return (
    <div class="toolbar" role="toolbar" aria-label="Scene tools">
      <Dropdown
        label="File"
        menuLabel="File"
        items={[
          { label: 'New scene', onSelect: confirmNewScene },
          { label: 'Open…', shortcut: 'Ctrl+O', onSelect: chooseSceneFile },
          { label: 'Save', shortcut: 'Ctrl+S', onSelect: saveScene },
          { label: 'Export Zdog JS', onSelect: () => void exportScript() },
          { label: 'Export Lottie…', onSelect: () => setLottieOpen(true) },
        ]}
      />
      <Dropdown
        label="Add"
        menuLabel="Add"
        items={[
          ...SHAPE_TYPES.map((type) => ({
            label: SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label,
            onSelect: () => dispatch(addShapeOfType(type)),
          })),
          { label: 'Camera', onSelect: () => dispatch(addCameraCommand(newCameraView(camera, viewSize))) },
        ]}
      />
      <select
        class="toolbar-view"
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
      <button
        type="button"
        disabled={!hasSelection}
        onClick={() => selectedId && dispatch(duplicate(selectedId))}
      >
        Duplicate
      </button>
      <button
        type="button"
        disabled={!hasSelection}
        onClick={() => selectedId && dispatch(deleteObject(selectedId))}
      >
        Delete
      </button>
      <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        Undo
      </button>
      <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        Redo
      </button>
      <button
        type="button"
        title="Turn and zoom the view back to the start"
        disabled={viewing !== null || isDefaultFreeView(camera)}
        onClick={() => setFreeView(DEFAULT_FREE_VIEW)}
      >
        Reset view
      </button>
      {lottieOpen && (
        <ExportLottieDialog
          defaultWidth={viewSize?.width ?? 512}
          defaultHeight={viewSize?.height ?? 512}
          defaultCamera={viewing}
          onClose={closeLottie}
        />
      )}
    </div>
  );
}
