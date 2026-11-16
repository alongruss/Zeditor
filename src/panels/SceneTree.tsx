import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ancestorsOf, childrenOf, findGroup } from '../model/hierarchy';
import { findShape } from '../model/scene';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import type { Placeable, Scene, SceneObject } from '../model/types';
import { rename, select, selectMany, toggleSelect } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';
import { STICKER } from './shapeTiles';

/** Indent per level of nesting, in pixels. */
const INDENT_PX = 14;
/** Groups this deep (0 = at the top) start open; deeper ones start closed, so a big scene reads at a glance. */
const OPEN_DEPTH = 2;

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
  const { scene, selectedId, selectedIds } = useEditorState();
  // The rows in the order they're shown, for Shift-click ranges.
  const order: string[] = [];
  /** Click selects; Ctrl (Cmd) adds or takes out; Shift selects the rows from the last one picked. */
  const pick = (id: string, event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) dispatch(toggleSelect(id));
    else if (event.shiftKey && selectedId !== null && order.includes(selectedId)) {
      const from = order.indexOf(selectedId);
      const to = order.indexOf(id);
      const range = from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1).reverse();
      dispatch(selectMany(range));
    } else dispatch(select(id));
  };
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Groups you opened or closed yourself; the rest follow OPEN_DEPTH.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  // Something selected inside a closed group (e.g. by clicking it in the scene) opens it.
  const mustOpen = openForSelection(scene, selectedId);
  const isOpen = (id: string, depth: number) => mustOpen.has(id) || (toggled.get(id) ?? depth < OPEN_DEPTH);
  const toggle = (id: string, depth: number) =>
    setToggled((current) => new Map(current).set(id, !isOpen(id, depth)));

  const item = (object: SceneObject, depth: number) => {
    const selected = selectedIds.includes(object.id);
    order.push(object.id);
    const isCamera = object.type === 'Camera';
    const isGroup = object.type === 'Group';
    const open = isGroup && isOpen(object.id, depth);
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
              onClick={() => toggle(object.id, depth)}
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
              title="Double-click to rename. Ctrl-click (Cmd-click) to select more than one."
              onClick={(event) => pick(object.id, event)}
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
