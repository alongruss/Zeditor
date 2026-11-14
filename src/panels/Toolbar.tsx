import { chooseSceneFile, exportScript, saveScene } from '../files/sceneFiles';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import { addShapeOfType, deleteShape, duplicate, newScene } from '../state/commands';
import { dispatch, redo, setCamera, undo, useCamera, useEditorState, useUndoAvailability } from '../state/store';
import { DEFAULT_CAMERA, isDefaultCamera } from '../viewport/camera';
import { Dropdown } from './Dropdown';

export const NEW_SCENE_PROMPT = 'Start a new, empty scene? You can undo this with Ctrl+Z.';

/** Asks first, then empties the scene (undoable). */
export function confirmNewScene(): void {
  if (window.confirm(NEW_SCENE_PROMPT)) dispatch(newScene);
}

/** Floating toolbar over the viewport: File, Add, Duplicate, Delete, Undo, Redo, Reset view. */
export function Toolbar() {
  const { selectedId } = useEditorState();
  const { canUndo, canRedo } = useUndoAvailability();
  const camera = useCamera();
  const hasSelection = selectedId !== null;

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
        ]}
      />
      <Dropdown
        label="Add"
        menuLabel="Add shape"
        items={SHAPE_TYPES.map((type) => ({
          label: SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label,
          onSelect: () => dispatch(addShapeOfType(type)),
        }))}
      />
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
        onClick={() => selectedId && dispatch(deleteShape(selectedId))}
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
        disabled={isDefaultCamera(camera)}
        onClick={() => setCamera(DEFAULT_CAMERA)}
      >
        Reset view
      </button>
    </div>
  );
}
