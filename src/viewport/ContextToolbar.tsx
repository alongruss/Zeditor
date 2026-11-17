import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { groupKeyState } from '../model/animation';
import type { CameraData, PropertyPath, SceneObject, Vec3 } from '../model/types';
import { deleteObjects, duplicateObjects, select, toggleKey } from '../state/commands';
import { groupSelection, ungroupSelection } from '../state/groupActions';
import { setPivotGroup, usePivotGroup } from '../state/pivot';
import { usePointerDrag } from '../state/pointerDrag';
import { dispatch, editor } from '../state/store';
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
  /** The selected shape, group or camera (the one picked last), as posed on `frame`. */
  readonly object: SceneObject;
  /** How many objects are selected. With more than one, the actions act on them all. */
  readonly count: number;
  /** Where the gizmo sits: the selected shapes' and groups' middle, in the world. */
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
  camera: CameraData | null,
  origin: Vec3,
  view: ViewTransform,
  outline: HTMLDivElement | null,
): [Rect, Rect | null] {
  if (camera) {
    const corners = cameraCorners(camera).map((corner) => project(corner, view));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return [{ left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }, null];
  }
  const center = project(origin, view);
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
export function ContextToolbar({ object, count, origin, view, frame, pinned, playing, outline, scene }: ContextToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const dragging = usePointerDrag();
  const several = count > 1;
  // With several selected, the camera's frame isn't the selection: place it like shapes.
  const isCamera = object.type === 'Camera' && !several;
  const isGroup = object.type === 'Group' && !several;
  const parentId = object.type !== 'Camera' && !several ? object.parent : undefined;
  const pivotOn = usePivotGroup() === object.id && isGroup;
  // Roving focus: one Tab stop, the arrow keys move between the buttons (numbered in order).
  const groupIndex = 2;
  const pivotIndex = groupIndex + (several || !isCamera ? 1 : 0);
  const selectGroupIndex = pivotIndex + (isGroup ? 1 : 0);
  const keyIndex = selectGroupIndex + (parentId !== undefined ? 1 : 0);
  const stop = (index: number) => ({ tabIndex: active === index ? 0 : -1, onFocus: () => setActive(index) });
  const keyPaths = isCamera ? CAMERA_KEY_PATHS : SHAPE_KEY_PATHS;
  const keyed = groupKeyState(object, keyPaths, frame) === 'key';
  const keyLabel = isCamera ? 'Key view' : 'Key transform';

  const place = () => {
    const bar = ref.current;
    if (!bar) return;
    const size = { width: bar.offsetWidth, height: bar.offsetHeight };
    const area = { width: view.width, height: view.height };
    let position;
    if (pinned) {
      position = { x: Math.max(8, (area.width - size.width) / 2), y: 8 };
    } else {
      // A camera alone: around its frame. Shapes and groups (or a mix): around them and the gizmo.
      const camera = object.type === 'Camera' && (isCamera || !origin) ? object : null;
      const at = origin ?? (object.type === 'Camera' ? object.target : object.translate);
      const [keepOut, fallback] = keepOutAreas(camera, at, view, outline);
      const anchor = camera ? (keepOut.left + keepOut.right) / 2 : project(at, view).x;
      position = toolbarPlacement(keepOut, fallback, anchor, size, area);
    }
    bar.style.left = `${Math.round(position.x)}px`;
    bar.style.top = `${Math.round(position.y)}px`;
    bar.style.visibility = 'visible';
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // Placed after every render, and again whenever the scene redraws the
  // selection outline (a frame later): otherwise the toolbar would only move
  // on its next render, e.g. when a press on one of its buttons focuses it,
  // and the release would miss the button.
  useLayoutEffect(place);
  useLayoutEffect(() => {
    if (!outline) return;
    const observer = new MutationObserver(() => placeRef.current());
    observer.observe(outline, { attributes: true, attributeFilter: ['style', 'hidden'] });
    return () => observer.disconnect();
  }, [outline]);

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
    dispatch(deleteObjects(editor.get().selectedIds));
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
      aria-label={several ? `Actions for ${count} selected` : 'Selection actions'}
      style={{ visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      <button type="button" {...stop(0)} onClick={() => dispatch(duplicateObjects(editor.get().selectedIds))}>
        Duplicate
      </button>
      <button type="button" {...stop(1)} onClick={onDelete}>
        Delete
      </button>
      {(several || !isCamera) && (
        <button
          type="button"
          {...stop(groupIndex)}
          title={
            isGroup
              ? 'Take everything out of this group (Ctrl+Shift+G)'
              : several
                ? 'Put these in one new group (Ctrl+G)'
                : 'Put this in a new group (Ctrl+G)'
          }
          onClick={isGroup ? ungroupSelection : groupSelection}
        >
          {isGroup ? 'Ungroup' : 'Group'}
        </button>
      )}
      {isGroup && (
        <button
          type="button"
          class="pivot-toggle"
          {...stop(pivotIndex)}
          aria-pressed={pivotOn}
          title="Move the pivot: the point this group turns and scales about. What's inside stays put."
          onClick={() => setPivotGroup(pivotOn ? null : object.id)}
        >
          Pivot
        </button>
      )}
      {parentId !== undefined && (
        <button type="button" {...stop(selectGroupIndex)} title="Select the group this is in" onClick={() => dispatch(select(parentId))}>
          Select group
        </button>
      )}
      {!several && (
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
      )}
    </div>
  );
}
