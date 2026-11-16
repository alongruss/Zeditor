import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { groupKeyState } from '../model/animation';
import type { PropertyPath, SceneObject, Vec3 } from '../model/types';
import { deleteObject, duplicate, select, toggleKey } from '../state/commands';
import { groupSelection, ungroupSelection } from '../state/groupActions';
import { usePointerDrag } from '../state/pointerDrag';
import { dispatch } from '../state/store';
import { pause } from '../state/timeline';
import { cameraCorners } from './CameraFrames';
import { GIZMO_REACH_PX, project, type ViewTransform } from './gizmoMath';
import { squareAround, toolbarPlacement, union, type Rect } from './toolbarPlacement';

const SHAPE_KEY_PATHS: readonly PropertyPath[] = [
  'translate.x', 'translate.y', 'translate.z',
  'rotate.x', 'rotate.y', 'rotate.z',
  'scale',
];
const CAMERA_KEY_PATHS: readonly PropertyPath[] = [
  'rotate.x', 'rotate.y', 'rotate.z',
  'target.x', 'target.y', 'target.z',
  'viewSpan',
];

interface ContextToolbarProps {
  /** The selected shape, group or camera, as posed on `frame`. */
  readonly object: SceneObject;
  /** A shape's or group's position in the world (its own is in its group's space). */
  readonly origin?: Vec3;
  readonly view: ViewTransform;
  readonly frame: number;
  /** Looking through this camera: the toolbar sits at the top center. */
  readonly pinned: boolean;
  readonly playing: boolean;
  /** The selection outline (positioned by SceneView), for the selection's bounds. */
  readonly outline: HTMLDivElement | null;
  /** Where focus goes on Escape and when playback hides the toolbar. */
  readonly scene: SVGSVGElement | null;
}

/** The part of the viewport the toolbar must not cover, and the gizmo's square alone. */
function keepOutAreas(
  object: SceneObject,
  origin: Vec3 | undefined,
  view: ViewTransform,
  outline: HTMLDivElement | null,
): [Rect, Rect | null] {
  if (object.type === 'Camera') {
    const corners = cameraCorners(object).map((corner) => project(corner, view));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return [{ left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }, null];
  }
  const center = project(origin ?? object.translate, view);
  const gizmo = squareAround(center.x, center.y, GIZMO_REACH_PX);
  const parent = outline?.offsetParent;
  if (!outline || outline.hidden || !(parent instanceof HTMLElement)) return [gizmo, gizmo];
  const box = outline.getBoundingClientRect();
  const area = parent.getBoundingClientRect();
  const bounds = { left: box.left - area.left, top: box.top - area.top, right: box.right - area.left, bottom: box.bottom - area.top };
  return [union(bounds, gizmo), gizmo];
}

/**
 * A small floating toolbar next to the selection: Duplicate, Delete and a
 * keyframe button for the whole transform (or a camera's view). It never
 * covers the selection or a gizmo handle, fades out while you drag, and
 * hides during playback. One Tab stop; the arrow keys move inside it.
 */
export function ContextToolbar({ object, origin, view, frame, pinned, playing, outline, scene }: ContextToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const dragging = usePointerDrag();
  const isCamera = object.type === 'Camera';
  const isGroup = object.type === 'Group';
  const parentId = object.type !== 'Camera' ? object.parent : undefined;
  // Roving focus: one Tab stop, the arrow keys move between the buttons.
  const keyIndex = (isCamera ? 2 : 3) + (parentId !== undefined ? 1 : 0);
  const stop = (index: number) => ({ tabIndex: active === index ? 0 : -1, onFocus: () => setActive(index) });
  const keyPaths = isCamera ? CAMERA_KEY_PATHS : SHAPE_KEY_PATHS;
  const keyed = groupKeyState(object, keyPaths, frame) === 'key';
  const keyLabel = isCamera ? 'Key view' : 'Key transform';

  // Placed after every render, once the selection outline has been drawn.
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const size = { width: bar.offsetWidth, height: bar.offsetHeight };
    const area = { width: view.width, height: view.height };
    let position;
    if (pinned) {
      position = { x: Math.max(8, (area.width - size.width) / 2), y: 8 };
    } else {
      const [keepOut, fallback] = keepOutAreas(object, origin, view, outline);
      const anchor = isCamera ? (keepOut.left + keepOut.right) / 2 : project(origin ?? object.translate, view).x;
      position = toolbarPlacement(keepOut, fallback, anchor, size, area);
    }
    bar.style.left = `${Math.round(position.x)}px`;
    bar.style.top = `${Math.round(position.y)}px`;
    bar.style.visibility = 'visible';
  });

  // Playback hides the toolbar; focus inside it moves to the scene first.
  useLayoutEffect(() => {
    if (playing && ref.current?.contains(document.activeElement)) scene?.focus();
  }, [playing]);

  const buttons = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  const focusButton = (index: number) => {
    const all = buttons();
    const next = Math.max(0, Math.min(all.length - 1, index));
    setActive(next);
    all[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: buttons().length - 1 };
    if (event.key in moves) {
      // Handled here, so the window's frame shortcuts don't also move the playhead.
      event.preventDefault();
      focusButton(moves[event.key]);
    } else if (event.key === 'Escape') {
      // The window's Escape shortcut then clears the selection.
      scene?.focus();
    }
  };

  const onDelete = () => {
    // Focus goes to the row that takes the deleted one's place, else the one
    // before it, else the Add button.
    const rows = () => [...document.querySelectorAll<HTMLElement>('.scene-tree .tree-item')];
    const index = rows().findIndex((row) => row.getAttribute('aria-pressed') === 'true');
    dispatch(deleteObject(object.id));
    requestAnimationFrame(() => {
      const after = rows();
      const target = after[Math.min(Math.max(index, 0), after.length - 1)] ?? document.querySelector<HTMLElement>('.add-menu > button');
      target?.focus();
    });
  };

  if (playing) return null;
  return (
    <div
      ref={ref}
      class={dragging ? 'context-toolbar is-dragging' : 'context-toolbar'}
      role="toolbar"
      aria-label="Selection actions"
      style={{ visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      <button type="button" {...stop(0)} onClick={() => dispatch(duplicate(object.id))}>
        Duplicate
      </button>
      <button type="button" {...stop(1)} onClick={onDelete}>
        Delete
      </button>
      {!isCamera && (
        <button
          type="button"
          {...stop(2)}
          title={isGroup ? 'Take everything out of this group (Ctrl+Shift+G)' : 'Put this in a new group (Ctrl+G)'}
          onClick={isGroup ? ungroupSelection : groupSelection}
        >
          {isGroup ? 'Ungroup' : 'Group'}
        </button>
      )}
      {parentId !== undefined && (
        <button type="button" {...stop(isCamera ? 2 : 3)} title="Select the group this is in" onClick={() => dispatch(select(parentId))}>
          Select group
        </button>
      )}
      <button
        type="button"
        class={keyed ? 'key-all is-keyed' : 'key-all'}
        {...stop(keyIndex)}
        aria-label={keyLabel}
        aria-pressed={keyed}
        title={`${keyLabel} on frame ${frame}`}
        onClick={() => {
          pause();
          dispatch(toggleKey(object.id, keyPaths, frame));
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" transform="rotate(45 8 8)" />
        </svg>
      </button>
    </div>
  );
}
