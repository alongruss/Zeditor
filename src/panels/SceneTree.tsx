import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ancestorsOf, childrenOf, findGroup } from '../model/hierarchy';
import { findShape } from '../model/scene';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import type { Placeable, Scene, SceneObject } from '../model/types';
import { rename, select } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';
import { STICKER } from './shapeTiles';

/** Indent per level of nesting, in pixels. */
const INDENT_PX = 14;

const typeLabel = (object: SceneObject) =>
  object.type === 'Camera' ? 'Camera' : object.type === 'Group' ? 'Group' : SHAPE_TYPE_DEFS[object.type].label;

/** The groups that must be open for the selection to show. */
function openForSelection(scene: Scene, selectedId: string | null): Set<string> {
  const selected: Placeable | undefined = findShape(scene, selectedId) ?? findGroup(scene, selectedId);
  return new Set(selected ? ancestorsOf(scene, selected).map((group) => group.id) : []);
}

/**
 * The scene's shapes and groups (nested: a group's insides are under it),
 * then its cameras. Click selects; double-click renames; ▸ opens a group.
 */
export function SceneTree() {
  const { scene, selectedId } = useEditorState();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  // Something selected inside a closed group (e.g. by clicking it in the scene) opens it.
  const mustOpen = openForSelection(scene, selectedId);
  const isOpen = (id: string) => !closed.has(id) || mustOpen.has(id);
  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (isOpen(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const item = (object: SceneObject, depth: number) => {
    const selected = object.id === selectedId;
    const isCamera = object.type === 'Camera';
    const isGroup = object.type === 'Group';
    const open = isGroup && isOpen(object.id);
    const inside = isGroup && open ? childrenOf(scene, object.id) : [];
    return (
      <li key={object.id} class={selected ? 'is-selected' : undefined}>
        <div class="tree-row" style={{ paddingLeft: `${depth * INDENT_PX}px` }}>
          {isGroup ? (
            <button
              type="button"
              class="tree-toggle"
              aria-expanded={open}
              aria-label={`${open ? 'Close' : 'Open'} ${object.name}`}
              onClick={() => toggle(object.id)}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            depth > 0 && <span class="tree-toggle-space" aria-hidden="true" />
          )}
          {renamingId === object.id ? (
            <RenameInput
              label={isCamera ? 'Camera name' : isGroup ? 'Group name' : 'Shape name'}
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
              {isGroup ? (
                <svg class="tree-group-icon" viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="1" y="2.5" width="10" height="8" rx="2" />
                  <path d="M1 4.5h10" />
                </svg>
              ) : (
                <span class="tree-dot" aria-hidden="true" style={{ background: STICKER[object.type] }} />
              )}
              <span class="tree-name">{object.name}</span>
              <span class="tree-type">{typeLabel(object)}</span>
            </button>
          )}
        </div>
        {inside.length > 0 && (
          <ul class="scene-tree" aria-label={`Inside ${object.name}`}>
            {inside.map((child) => item(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const top = childrenOf(scene, null);
  return (
    <div class="scene-tree-sections">
      {top.length === 0 ? (
        <p class="panel-empty">No shapes yet. Use Add to create one.</p>
      ) : (
        <ul class="scene-tree" aria-label="Shapes">
          {top.map((object) => item(object, 0))}
        </ul>
      )}
      {scene.cameras.length > 0 && (
        <section class="tree-section" aria-labelledby="tree-cameras-title">
          <h3 class="tree-heading" id="tree-cameras-title">
            Cameras
          </h3>
          <ul class="scene-tree" aria-label="Cameras">
            {scene.cameras.map((camera) => item(camera, 0))}
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
