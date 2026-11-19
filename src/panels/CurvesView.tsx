import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { propertiesOf } from '../model/animatable';
import { valueAt } from '../model/animation';
import { CURVE_X, CURVE_Y, curveOf, easingLabel } from '../model/easing';
import { keyRefId, type KeyRef } from '../model/keyEdits';
import { findObject } from '../model/scene';
import type { EasingCurve, Keyframe, Scene, SceneObject } from '../model/types';
import { setEasingCommand } from '../state/commands';
import { newGroup } from '../state/history';
import { dispatch } from '../state/store';
import { pause, selectKeys, timeline } from '../state/timeline';

/** One color per curve, the same in both themes. Position x, y, z: red, green, blue, as the gizmo's arrows. */
const AXIS_COLORS: Record<string, string> = { x: '#e5484d', y: '#30a46c', z: '#3e63dd' };
const OTHER_COLORS = ['#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#978365', '#ffb224', '#0090ff'];

/** Room above and below the curves, in pixels. */
const PAD_Y = 12;
/** A segment flatter than this on screen gets a taller box for its handles, so they can still be dragged. */
const MIN_BOX = 24;
/** How far an arrow key moves a handle. */
const NUDGE = 0.05;

interface Curve {
  readonly path: string;
  readonly label: string;
  readonly color: string;
  readonly keys: readonly Keyframe[];
  readonly min: number;
  readonly max: number;
}

interface CurvesViewProps {
  readonly scene: Scene;
  readonly selectedId: string | null;
  readonly selectedKeys: readonly KeyRef[];
  readonly last: number;
  readonly laneWidth: number;
  readonly xOf: (frame: number) => number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** `n` within `low` to `high`; `low` when it isn't a number (a box with no width gives none). */
const clamp = (n: number, [low, high]: readonly [number, number]) => (Number.isNaN(n) ? low : Math.min(high, Math.max(low, n)));

/** The object's number tracks, each with the range its curve covers. */
function curvesOf(object: SceneObject, last: number): Curve[] {
  const curves: Curve[] = [];
  let other = 0;
  for (const spec of propertiesOf(object.type)) {
    const keys = object.tracks?.[spec.path];
    if (!keys || spec.kind !== 'number') continue;
    let min = Infinity;
    let max = -Infinity;
    const steps = Math.max(1, last) * 4;
    for (let i = 0; i <= steps; i++) {
      const value = valueAt(object, spec.path, (i / steps) * last) as number;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const axis = /^translate\.([xyz])$/.exec(spec.path)?.[1];
    const color = axis ? AXIS_COLORS[axis] : OTHER_COLORS[other++ % OTHER_COLORS.length];
    curves.push({ path: spec.path, label: spec.label, color, keys, min, max });
  }
  return curves;
}

/**
 * The timeline as curves: the selected object's animated numbers as lines
 * over time, each stretched to fill the height (the legend gives its range).
 * Click a key, or a stretch of curve, to select the key it starts from; the
 * stretch then shows two handles. Dragging them (or nudging them with the
 * arrow keys) shapes how the value eases from that key to the next, as a
 * custom curve. One undo step per drag.
 */
export function CurvesView({ scene, selectedId, selectedKeys, last, laneWidth, xOf }: CurvesViewProps) {
  const graphRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(0);
  const [solo, setSolo] = useState<string | null>(null);
  const drag = useRef<{ pointerId: number; handle: 1 | 2; group: string } | null>(null);

  // The graph's height, followed on whichever element holds it (it's a new one when the view
  // switches between "no curves" and curves).
  const setGraph = useCallback((graph: HTMLDivElement | null) => {
    observer.current?.disconnect();
    graphRef.current = graph;
    if (!graph) return;
    observer.current = new ResizeObserver(() => setHeight(graph.clientHeight));
    observer.current.observe(graph);
    setHeight(graph.clientHeight);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const object = selectedId ? findObject(scene, selectedId) : undefined;
  const curves = object ? curvesOf(object, last) : [];
  if (!object || curves.length === 0) {
    return (
      <div class="tl-curves">
        <div class="tl-legend" />
        <div class="tl-graph" ref={setGraph}>
          <p class="tl-empty">
            {object
              ? `${object.name} has no animated numbers yet. Key a position, rotation, scale or size to see its curve.`
              : 'Select an animated shape, group or camera to see its curves.'}
          </p>
        </div>
      </div>
    );
  }
  // Showing one curve only applies while this object has it (another object may not).
  const soloed = curves.some((curve) => curve.path === solo) ? solo : null;
  const shown = curves.filter((curve) => soloed === null || curve.path === soloed);

  const yOf = (curve: Curve, value: number) => {
    const span = curve.max - curve.min;
    const inner = Math.max(1, height - 2 * PAD_Y);
    return span < 1e-9 ? height / 2 : PAD_Y + (1 - (value - curve.min) / span) * inner;
  };
  const pointOf = (curve: Curve, key: Keyframe) => ({ x: xOf(key.frame), y: yOf(curve, valueAt(object, curve.path, key.frame) as number) });
  const ref = (curve: Curve, key: Keyframe): KeyRef => ({ objectId: object.id, path: curve.path, frame: key.frame });
  const selectedIds = new Set(selectedKeys.map(keyRefId));

  // The stretch being shaped: one selected key, with a key after it, that doesn't hold.
  const only = selectedKeys.length === 1 ? selectedKeys[0] : null;
  const active = only?.objectId === object.id ? shown.find((curve) => curve.path === only.path) : undefined;
  const index = active ? active.keys.findIndex((key) => key.frame === only!.frame) : -1;
  const from = active && index >= 0 ? active.keys[index] : undefined;
  const to = active && index >= 0 ? active.keys[index + 1] : undefined;
  const shape = from && to ? curveOf(from.easing) : null;
  /** The handles' box: from the key to the next, never too flat to grab. */
  const box = active && from && to && shape ? (() => {
    const a = pointOf(active, from);
    const b = pointOf(active, to);
    const dy = Math.abs(b.y - a.y) < MIN_BOX ? -MIN_BOX * 2 : b.y - a.y;
    return { x: a.x, y: a.y, dx: b.x - a.x, dy, end: b };
  })() : null;

  const setCurve = (curve: EasingCurve, group?: string) => {
    if (!active || !from) return;
    pause();
    dispatch(setEasingCommand([ref(active, from)], curve), group ? { group } : undefined);
  };
  const handleAt = (handle: 1 | 2, clientX: number, clientY: number): EasingCurve | null => {
    if (!box || !shape) return null;
    const rect = graphRef.current!.getBoundingClientRect();
    const x = round3(clamp((clientX - rect.left - box.x) / box.dx, CURVE_X));
    const y = round3(clamp((clientY - rect.top - box.y) / box.dy, CURVE_Y));
    return handle === 1 ? [x, y, shape[2], shape[3]] : [shape[0], shape[1], x, y];
  };

  const selectKey = (curve: Curve, key: Keyframe, add: boolean) => {
    const picked = ref(curve, key);
    const current = timeline.get().selectedKeys;
    selectKeys(add ? (selectedIds.has(keyRefId(picked)) ? current.filter((r) => keyRefId(r) !== keyRefId(picked)) : [...current, picked]) : [picked]);
  };

  /** A stretch of curve between two keys (or before the first and after the last), sampled every 2px. */
  const segmentPath = (curve: Curve, start: number, end: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(xOf(end) - xOf(start)) / 2));
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = start + ((end - start) * i) / steps;
      points.push(`${xOf(f).toFixed(1)},${yOf(curve, valueAt(object, curve.path, f) as number).toFixed(1)}`);
    }
    return `M${points.join('L')}`;
  };

  const handles = box && shape && active && from && to
    ? ([1, 2] as const).map((handle) => {
        const hx = shape[handle === 1 ? 0 : 2];
        const hy = shape[handle === 1 ? 1 : 3];
        const at = { x: box.x + hx * box.dx, y: box.y + hy * box.dy };
        const anchor = handle === 1 ? { x: box.x, y: box.y } : box.end;
        return { handle, hx, hy, at, anchor };
      })
    : [];

  return (
    <div class="tl-curves">
      <ul class="tl-legend" aria-label="Curves">
        {curves.map((curve) => (
          <li key={curve.path}>
            <button
              type="button"
              class="tl-legend-item"
              aria-pressed={soloed === curve.path}
              title={`${curve.label}: ${round3(curve.min)} to ${round3(curve.max)}. Click to show only this curve.`}
              onClick={() => setSolo(soloed === curve.path ? null : curve.path)}
            >
              <span class="tl-legend-swatch" style={{ background: curve.color }} aria-hidden="true" />
              {curve.label}
            </button>
          </li>
        ))}
        {curves.length > 1 && <li class="tl-legend-hint">Click a name to show only that curve.</li>}
      </ul>
      <div class="tl-graph" ref={setGraph}>
        {height > 0 && laneWidth > 0 && (
          <svg class="tl-graph-svg" width={laneWidth} height={height} aria-label={`${object.name} curves`} role="group">
            {box && (
              <rect
                class="tl-curve-box"
                x={Math.min(box.x, box.x + box.dx)}
                y={Math.min(box.y, box.y + box.dy)}
                width={Math.abs(box.dx)}
                height={Math.abs(box.dy)}
              />
            )}
            {/* The curve being shaped goes last, on top of any it overlaps. */}
            {[...shown.filter((curve) => curve !== active), ...(active ? [active] : [])].map((curve) => {
              const first = curve.keys[0];
              const lastKey = curve.keys[curve.keys.length - 1];
              const dimmed = active !== undefined && curve !== active;
              return (
                <g key={curve.path} class={dimmed ? 'tl-curve is-dimmed' : 'tl-curve'} style={{ color: curve.color }}>
                  {first.frame > 0 && <path class="tl-curve-line is-outside" d={segmentPath(curve, 0, first.frame)} />}
                  {lastKey.frame < last && <path class="tl-curve-line is-outside" d={segmentPath(curve, lastKey.frame, last)} />}
                  {curve.keys.slice(0, -1).map((key, i) => {
                    const d = segmentPath(curve, key.frame, curve.keys[i + 1].frame);
                    return (
                      <g key={key.frame}>
                        <path class="tl-curve-line" d={d} />
                        <path
                          class="tl-curve-hit"
                          d={d}
                          data-curve-segment={`${curve.path}@${key.frame}`}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            selectKey(curve, key, false);
                          }}
                        >
                          <title>{`${curve.label}, frames ${key.frame} to ${curve.keys[i + 1].frame}: ${easingLabel(key.easing)}`}</title>
                        </path>
                      </g>
                    );
                  })}
                  {curve.keys.map((key) => {
                    const p = pointOf(curve, key);
                    const selected = selectedIds.has(keyRefId(ref(curve, key)));
                    return (
                      <circle
                        key={key.frame}
                        class={selected ? 'tl-curve-key is-selected' : 'tl-curve-key'}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        role="button"
                        aria-pressed={selected}
                        aria-label={`${curve.label} key on frame ${key.frame}, ${easingLabel(key.easing)}`}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.preventDefault();
                          selectKey(curve, key, event.shiftKey);
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}
            {handles.map(({ handle, hx, hy, at, anchor }) => (
              <g key={handle} class="tl-curve-handle-group" style={{ color: active!.color }}>
                <line class="tl-curve-arm" x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} />
                <circle
                  class="tl-curve-handle"
                  data-handle={handle}
                  cx={at.x}
                  cy={at.y}
                  r={6}
                  tabindex={0}
                  role="button"
                  aria-label={`Curve handle ${handle}: time ${round3(hx)}, amount ${round3(hy)}. Drag, or use the arrow keys.`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    (event.currentTarget as Element).setPointerCapture(event.pointerId);
                    drag.current = { pointerId: event.pointerId, handle, group: newGroup() };
                  }}
                  onPointerMove={(event) => {
                    const current = drag.current;
                    if (!current || current.pointerId !== event.pointerId) return;
                    const curve = handleAt(current.handle, event.clientX, event.clientY);
                    if (curve) setCurve(curve, current.group);
                  }}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                  onKeyDown={(event) => {
                    const moves: Record<string, [number, number]> = {
                      ArrowLeft: [-NUDGE, 0],
                      ArrowRight: [NUDGE, 0],
                      // Up is more of the change (screen up, when the value rises).
                      ArrowUp: [0, box!.dy < 0 ? NUDGE : -NUDGE],
                      ArrowDown: [0, box!.dy < 0 ? -NUDGE : NUDGE],
                    };
                    const move = moves[event.key];
                    if (!move || !shape) return;
                    event.preventDefault();
                    const x = round3(clamp(hx + move[0], CURVE_X));
                    const y = round3(clamp(hy + move[1], CURVE_Y));
                    setCurve(handle === 1 ? [x, y, shape[2], shape[3]] : [shape[0], shape[1], x, y]);
                  }}
                />
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
