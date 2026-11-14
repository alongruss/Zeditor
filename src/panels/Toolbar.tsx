import { useEffect, useRef, useState } from 'preact/hooks';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import { addShapeOfType, deleteShape, duplicate, newScene } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';

export const NEW_SCENE_PROMPT = 'Start a new, empty scene? The current scene will be cleared.';

/** Floating toolbar over the viewport: Add, Duplicate, Delete, New scene. */
export function Toolbar() {
  const { scene, selectedId } = useEditorState();
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!addRef.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [addOpen]);

  const hasSelection = selectedId !== null;

  return (
    <div class="toolbar" role="toolbar" aria-label="Scene tools">
      <div class="toolbar-add" ref={addRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={addOpen}
          onClick={() => setAddOpen((open) => !open)}
        >
          Add ▾
        </button>
        {addOpen && (
          <div class="add-menu" role="menu" aria-label="Add shape">
            {SHAPE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => {
                  dispatch(addShapeOfType(type));
                  setAddOpen(false);
                }}
              >
                {SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label}
              </button>
            ))}
          </div>
        )}
      </div>
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
      <button
        type="button"
        disabled={scene.shapes.length === 0}
        onClick={() => {
          if (window.confirm(NEW_SCENE_PROMPT)) dispatch(newScene);
        }}
      >
        New scene
      </button>
    </div>
  );
}
