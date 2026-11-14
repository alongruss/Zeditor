import { useEffect, useRef, useState } from 'preact/hooks';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { rename, select } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';

/** List of the scene's shapes. Click selects; double-click renames. */
export function SceneTree() {
  const { scene, selectedId } = useEditorState();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  if (scene.shapes.length === 0) {
    return <p class="panel-empty">No shapes yet. Use Add to create one.</p>;
  }

  return (
    <ul class="scene-tree" aria-label="Shapes">
      {scene.shapes.map((shape) => {
        const selected = shape.id === selectedId;
        return (
          <li key={shape.id} class={selected ? 'is-selected' : undefined}>
            {renamingId === shape.id ? (
              <RenameInput
                initial={shape.name}
                onDone={(name) => {
                  if (name !== null) dispatch(rename(shape.id, name));
                  setRenamingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                class="tree-item"
                aria-pressed={selected}
                title="Double-click to rename"
                onClick={() => dispatch(select(shape.id))}
                onDblClick={() => setRenamingId(shape.id)}
              >
                <span class="tree-name">{shape.name}</span>
                <span class="tree-type">{SHAPE_TYPE_DEFS[shape.type].label}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Inline name editor: Enter or blur saves, Escape cancels (reports null). */
function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  // Uncontrolled: set the text once, so a re-render can't wipe what is being typed.
  useEffect(() => {
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
      aria-label="Shape name"
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(event.currentTarget.value);
        if (event.key === 'Escape') finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
