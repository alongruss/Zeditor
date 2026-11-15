import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import type { SceneObject } from '../model/types';
import { rename, select } from '../state/commands';
import { STICKER } from './shapeTiles';
import { dispatch, useEditorState } from '../state/store';

/** The scene's shapes, then its cameras. Click selects; double-click renames. */
export function SceneTree() {
  const { scene, selectedId } = useEditorState();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const item = (object: SceneObject) => {
    const selected = object.id === selectedId;
    const isCamera = object.type === 'Camera';
    return (
      <li key={object.id} class={selected ? 'is-selected' : undefined}>
        {renamingId === object.id ? (
          <RenameInput
            label={isCamera ? 'Camera name' : 'Shape name'}
            initial={object.name}
            onDone={(name) => {
              if (name !== null) dispatch(rename(object.id, name));
              setRenamingId(null);
            }}
          />
        ) : (
          <button
            type="button"
            class="tree-item"
            aria-pressed={selected}
            title="Double-click to rename"
            onClick={() => dispatch(select(object.id))}
            onDblClick={() => setRenamingId(object.id)}
          >
            <span class="tree-dot" aria-hidden="true" style={{ background: STICKER[object.type] }} />
            <span class="tree-name">{object.name}</span>
            <span class="tree-type">{isCamera ? 'Camera' : SHAPE_TYPE_DEFS[object.type].label}</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <div class="scene-tree-sections">
      {scene.shapes.length === 0 ? (
        <p class="panel-empty">No shapes yet. Use Add to create one.</p>
      ) : (
        <ul class="scene-tree" aria-label="Shapes">
          {scene.shapes.map(item)}
        </ul>
      )}
      {scene.cameras.length > 0 && (
        <section class="tree-section" aria-labelledby="tree-cameras-title">
          <h3 class="tree-heading" id="tree-cameras-title">
            Cameras
          </h3>
          <ul class="scene-tree" aria-label="Cameras">
            {scene.cameras.map(item)}
          </ul>
        </section>
      )}
    </div>
  );
}

interface RenameInputProps {
  readonly label: string;
  readonly initial: string;
  readonly onDone: (name: string | null) => void;
}

/** Inline name editor: Enter or blur saves, Escape cancels (reports null). */
function RenameInput({ label, initial, onDone }: RenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  // Uncontrolled: set the text once, so a re-render can't wipe what is being typed.
  // A layout effect runs before the browser paints, so nothing typed straight
  // away can be overwritten (a plain effect ran too late on a slow machine).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.value = initial;
    input.focus();
    input.select();
  }, []); // run once on mount

  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };

  return (
    <input
      ref={inputRef}
      class="tree-rename"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(event.currentTarget.value);
        if (event.key === 'Escape') finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
