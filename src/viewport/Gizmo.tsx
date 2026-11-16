import { useRef } from 'preact/hooks';
import { applyTransform, directionInto, type Transform } from '../model/transform';
import type { Placeable, Vec3 } from '../model/types';
import { edit, editMany } from '../state/commands';
import { newGroup } from '../state/history';
import { setPointerDrag } from '../state/pointerDrag';
import { dispatch } from '../state/store';
import { pause } from '../state/timeline';
import {
  ARROW_HEAD_PX,
  AXES,
  angleBetween,
  arrowEnabled,
  arrowPoints,
  moveAlongAxis,
  project,
  ringDirection,
  ringPoints,
  ringRotation,
  screenAngle,
  type Axis,
  type ScreenPoint,
  type ViewTransform,
} from './gizmoMath';

/** What a handle drag started from. The camera can't change during a gizmo drag. */
type Drag =
  | {
      readonly kind: 'move';
      readonly axis: Axis;
      readonly pointerId: number;
      readonly start: ScreenPoint;
      /** Each target's id, position and group transform when the drag began. */
      readonly targets: readonly { readonly id: string; readonly translate: Vec3; readonly parent?: Transform }[];
      readonly group: string;
    }
  | {
      readonly kind: 'rotate';
      readonly axis: Axis;
      readonly pointerId: number;
      readonly center: ScreenPoint;
      readonly startDeg: number;
      readonly direction: -1 | 1;
      readonly group: string;
      lastAngle: number;
      swept: number;
    };

const toPoints = (points: readonly ScreenPoint[]) => points.map((p) => `${p.x},${p.y}`).join(' ');

/** A triangle pointing from `from` to `to`, with its tip at `to`. */
function arrowHead(from: ScreenPoint, to: ScreenPoint): ScreenPoint[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  const back = { x: to.x - ux * ARROW_HEAD_PX * 1.6, y: to.y - uy * ARROW_HEAD_PX * 1.6 };
  return [
    to,
    { x: back.x - uy * ARROW_HEAD_PX * 0.6, y: back.y + ux * ARROW_HEAD_PX * 0.6 },
    { x: back.x + uy * ARROW_HEAD_PX * 0.6, y: back.y - ux * ARROW_HEAD_PX * 0.6 },
  ];
}

/** A selected shape or group, as posed on the gizmo's frame. */
export interface GizmoTarget {
  readonly shape: Placeable;
  /** Its group's transform as seen from the world, if it's inside one. */
  readonly parent?: Transform;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Where a target sits in the world (its own position is in its group's space). */
const worldOrigin = ({ shape, parent }: GizmoTarget): Vec3 => (parent ? applyTransform(parent, shape.translate) : shape.translate);

/** The middle of the targets' world positions: where the gizmo sits. */
export function gizmoOrigin(targets: readonly GizmoTarget[]): Vec3 {
  const points = targets.map(worldOrigin);
  const mean = (axis: keyof Vec3) => points.reduce((sum, p) => sum + p[axis], 0) / Math.max(1, points.length);
  return { x: mean('x'), y: mean('y'), z: mean('z') };
}

interface GizmoProps {
  /**
   * The selected shapes and groups (none inside another). One gets arrows
   * and rings; several get arrows only, at their middle, moving them all.
   */
  readonly targets: readonly GizmoTarget[];
  readonly view: ViewTransform;
  /** The playhead's frame: animated values are keyed there. */
  readonly frame: number;
}

/**
 * Move arrows and rotation rings for the selected shape, drawn on their own
 * SVG layer above the scene so shapes can never hide them. Only the handles
 * take the pointer; everywhere else clicks and drags reach the scene.
 *
 * Arrows point along the world X/Y/Z axes. Each ring edits the matching
 * rotation value shown in the Inspector. Hold Shift to snap moves to whole
 * units and rotation to 15°. Each drag is one undo step.
 */
export function Gizmo({ targets, view, frame }: GizmoProps) {
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [{ shape, parent }] = targets;
  const single = targets.length === 1;
  const origin = gizmoOrigin(targets);
  const center = project(origin, view);

  /** Converts a point on this SVG to the page coordinates pointer events use. */
  const toPage = (p: ScreenPoint): ScreenPoint => {
    const bounds = svgRef.current?.getBoundingClientRect();
    return bounds ? { x: p.x + bounds.left, y: p.y + bounds.top } : p;
  };

  const startDrag = (event: PointerEvent, next: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    pause();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.current = next;
    setPointerDrag(true);
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (current.kind === 'move') {
      const moved = { x: point.x - current.start.x, y: point.y - current.start.y };
      if (current.targets.length === 1) {
        const [target] = current.targets;
        const translate = moveAlongAxis(target.translate, current.axis, moved, view, event.shiftKey, target.parent);
        dispatch(edit(target.id, { translate }, frame), { group: current.group });
      } else {
        // The same move in the world for each (snapped as a whole), written in each one's group space.
        const delta = moveAlongAxis(ZERO, current.axis, moved, view, event.shiftKey);
        const edits = current.targets.map((target) => {
          const local = target.parent ? directionInto(target.parent, delta) : delta;
          const t = target.translate;
          return { id: target.id, patch: { translate: { x: round3(t.x + local.x), y: round3(t.y + local.y), z: round3(t.z + local.z) } } };
        });
        dispatch(editMany(edits, frame), { group: current.group });
      }
    } else {
      const angle = screenAngle(current.center, point);
      current.swept += angleBetween(current.lastAngle, angle);
      current.lastAngle = angle;
      const value = ringRotation(current.startDeg, current.swept, current.direction, event.shiftKey);
      dispatch(edit(shape.id, { rotate: { [current.axis]: value } }, frame), { group: current.group });
    }
  };

  const endDrag = (event: PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPointerDrag(false);
  };

  // Several objects turn about their own origins, so turning them together needs a group (Ctrl+G).
  const rings = !single ? [] : AXES.map((axis) => {
    const direction = ringDirection(axis, shape.rotate, view, parent);
    const enabled = direction !== 0;
    const points = toPoints(ringPoints(origin, axis, shape.rotate, view, parent));
    return (
      <g
        key={`rotate-${axis}`}
        class={`gizmo-handle gizmo-ring axis-${axis}${enabled ? '' : ' is-off'}`}
        data-handle={`rotate-${axis}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || direction === 0) return;
          const pageCenter = toPage(center);
          startDrag(event, {
            kind: 'rotate',
            axis,
            pointerId: event.pointerId,
            center: pageCenter,
            startDeg: shape.rotate[axis],
            direction,
            group: newGroup(),
            lastAngle: screenAngle(pageCenter, { x: event.clientX, y: event.clientY }),
            swept: 0,
          });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <polyline class="gizmo-hit" points={points} />
        <polyline class="gizmo-line" points={points} />
      </g>
    );
  });

  const arrows = AXES.map((axis) => {
    const enabled = arrowEnabled(axis, view);
    const [from, to] = arrowPoints(origin, axis, view);
    return (
      <g
        key={`move-${axis}`}
        class={`gizmo-handle gizmo-arrow axis-${axis}${enabled ? '' : ' is-off'}`}
        data-handle={`move-${axis}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || !enabled) return;
          startDrag(event, {
            kind: 'move',
            axis,
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            targets: targets.map((t) => ({ id: t.shape.id, translate: t.shape.translate, parent: t.parent })),
            group: newGroup(),
          });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <line class="gizmo-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <line class="gizmo-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <polygon class="gizmo-head" points={toPoints(arrowHead(from, to))} />
      </g>
    );
  });

  return (
    <svg
      ref={svgRef}
      class="gizmo"
      width={view.width}
      height={view.height}
      aria-hidden="true"
      data-center={`${center.x},${center.y}`}
    >
      {rings}
      {arrows}
      <circle class="gizmo-center" cx={center.x} cy={center.y} r={3} />
    </svg>
  );
}
