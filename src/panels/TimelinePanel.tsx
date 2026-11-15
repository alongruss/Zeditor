import { useEffect, useRef, useState } from 'preact/hooks';
import { propertiesOf } from '../model/animatable';
import { EASING_LABELS } from '../model/easing';
import { keyRefId, moveKeys, sharedEasing, type KeyRef } from '../model/keyEdits';
import { allObjects } from '../model/scene';
import { EASINGS, type Easing, type Scene, type SceneObject } from '../model/types';
import { deleteKeysCommand, moveKeysCommand, select, setEasingCommand } from '../state/commands';
import { newGroup } from '../state/history';
import { dispatch, editor, useEditorState } from '../state/store';
import { clearKeySelection, pause, selectKeys, setFrame, timeline, useTimeline } from '../state/timeline';
import { PopupMenu, type MenuPosition } from './PopupMenu';

/** Space kept at each end of the lanes, so the first and last keys can be grabbed. */
const PAD = 8;
/** A press that moves less than this is a click, not a drag. */
const CLICK_TOLERANCE_PX = 3;

/** One diamond on screen: a single key, or (on an object's own row) every key on that frame. */
interface Diamond {
  readonly refs: readonly KeyRef[];
  readonly frame: number;
  readonly label: string;
  readonly hold: boolean;
}

interface Row {
  readonly id: string;
  readonly object: SceneObject;
  /** A property row's label; undefined for the object's own row. */
  readonly property?: string;
  readonly diamonds: readonly Diamond[];
}

/** The rows: each animated shape or camera (and the selected one), then its animated properties if expanded. */
function buildRows(scene: Scene, selectedId: string | null, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  for (const object of allObjects(scene)) {
    const tracks = object.tracks ?? {};
    if (Object.keys(tracks).length === 0 && object.id !== selectedId) continue;
    const byFrame = new Map<number, KeyRef[]>();
    for (const [path, track] of Object.entries(tracks)) {
      for (const key of track) {
        const refs = byFrame.get(key.frame) ?? [];
        refs.push({ objectId: object.id, path, frame: key.frame });
        byFrame.set(key.frame, refs);
      }
    }
    rows.push({
      id: object.id,
      object,
      diamonds: [...byFrame].map(([frame, refs]) => ({
        refs,
        frame,
        label: `${object.name} keys on frame ${frame}`,
        hold: false,
      })),
    });
    if (!expanded.has(object.id)) continue;
    for (const spec of propertiesOf(object.type)) {
      const track = tracks[spec.path];
      if (!track) continue;
      rows.push({
        id: `${object.id}|${spec.path}`,
        object,
        property: spec.label,
        diamonds: track.map((key) => ({
          refs: [{ objectId: object.id, path: spec.path, frame: key.frame }],
          frame: key.frame,
          label: `${object.name} ${spec.label} key on frame ${key.frame}, ${EASING_LABELS[key.easing]}`,
          hold: key.easing === 'hold',
        })),
      });
    }
  }
  return rows;
}

type Drag =
  | {
      readonly kind: 'keys';
      readonly pointerId: number;
      readonly startX: number;
      readonly origin: readonly SceneObject[];
      readonly refs: readonly KeyRef[];
      readonly group: string;
      delta: number;
    }
  | {
      readonly kind: 'marquee';
      readonly pointerId: number;
      readonly startX: number;
      readonly startY: number;
      readonly additive: boolean;
      readonly base: readonly KeyRef[];
      moved: boolean;
    }
  | { readonly kind: 'scrub'; readonly pointerId: number };

/**
 * The timeline: a row for each animated shape or camera (expand it for a row per
 * animated property), with its keyframes as diamonds.
 * - Click a key to select it, Shift-click to add or remove it, or drag across
 *   empty space to select a group.
 * - Drag selected keys left or right to move them (whole frames; one undo step).
 * - Right-click for easing and delete, or use the Easing menu; Delete deletes.
 * - Click or drag the ruler to move the playhead.
 */
export function TimelinePanel() {
  const { scene, selectedId } = useEditorState();
  const { frame, selectedKeys } = useTimeline();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [laneWidth, setLaneWidth] = useState(0);

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const observer = new ResizeObserver(() => setLaneWidth(ruler.clientWidth));
    observer.observe(ruler);
    setLaneWidth(ruler.clientWidth);
    return () => observer.disconnect();
  }, []);

  const last = Math.max(0, scene.settings.duration - 1);
  const span = Math.max(1, laneWidth - 2 * PAD);
  const pixelsPerFrame = last === 0 ? span : span / last;
  const xOf = (f: number) => PAD + (last === 0 ? 0 : (f / last) * span);
  const frameAt = (clientX: number) => {
    const left = rulerRef.current?.getBoundingClientRect().left ?? 0;
    return Math.min(last, Math.max(0, Math.round((clientX - left - PAD) / pixelsPerFrame)));
  };

  const rows = buildRows(scene, selectedId, expanded);
  const diamonds = rows.flatMap((row) => row.diamonds);
  const selectedIds = new Set(selectedKeys.map(keyRefId));
  const allSelected = (refs: readonly KeyRef[]) => refs.every((ref) => selectedIds.has(keyRefId(ref)));
  const someSelected = (refs: readonly KeyRef[]) => refs.some((ref) => selectedIds.has(keyRefId(ref)));
  const easing = sharedEasing(scene, selectedKeys);

  const labelStep = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200].find((s) => s * pixelsPerFrame >= 40) ?? 1200;
  const labels: number[] = [];
  if (laneWidth > 0) for (let f = 0; f <= last; f += labelStep) labels.push(f);

  const diamondAt = (target: EventTarget | null): Diamond | null => {
    const element = (target as Element | null)?.closest?.('[data-diamond]');
    const index = element ? Number(element.getAttribute('data-diamond')) : NaN;
    return Number.isInteger(index) ? (diamonds[index] ?? null) : null;
  };

  /** The keys whose diamonds lie inside a rectangle (client coordinates). */
  const keysInside = (left: number, top: number, right: number, bottom: number): KeyRef[] => {
    const inside: KeyRef[] = [];
    for (const element of bodyRef.current?.querySelectorAll('[data-diamond]') ?? []) {
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        inside.push(...(diamonds[Number(element.getAttribute('data-diamond'))]?.refs ?? []));
      }
    }
    return inside;
  };

  const onBodyPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('.tl-label')) return; // labels have their own buttons
    if (event.currentTarget instanceof Element) event.currentTarget.setPointerCapture(event.pointerId);
    const diamond = diamondAt(event.target);
    if (diamond) {
      event.preventDefault();
      if (event.shiftKey) {
        const current = timeline.get().selectedKeys;
        selectKeys(
          allSelected(diamond.refs)
            ? current.filter((ref) => !diamond.refs.some((r) => keyRefId(r) === keyRefId(ref)))
            : [...current, ...diamond.refs],
        );
        return;
      }
      if (!allSelected(diamond.refs)) selectKeys(diamond.refs);
      pause();
      drag.current = {
        kind: 'keys',
        pointerId: event.pointerId,
        startX: event.clientX,
        origin: allObjects(editor.get().scene),
        refs: timeline.get().selectedKeys,
        group: newGroup(),
        delta: 0,
      };
      return;
    }
    drag.current = {
      kind: 'marquee',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.shiftKey,
      base: event.shiftKey ? timeline.get().selectedKeys : [],
      moved: false,
    };
  };

  const onBodyPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.kind === 'keys') {
      const delta = Math.round((event.clientX - current.startX) / pixelsPerFrame);
      if (delta === current.delta) return;
      current.delta = delta;
      dispatch(moveKeysCommand(current.origin, current.refs, delta), { group: current.group });
      selectKeys(moveKeys(current.origin, current.refs, delta).refs);
    } else if (current.kind === 'marquee') {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(dx, dy) < CLICK_TOLERANCE_PX) return;
      current.moved = true;
      const left = Math.min(current.startX, event.clientX);
      const top = Math.min(current.startY, event.clientY);
      const right = Math.max(current.startX, event.clientX);
      const bottom = Math.max(current.startY, event.clientY);
      const body = bodyRef.current!.getBoundingClientRect();
      setMarquee({ left: left - body.left, top: top - body.top + bodyRef.current!.scrollTop, width: right - left, height: bottom - top });
      selectKeys([...current.base, ...keysInside(left, top, right, bottom)]);
    }
  };

  const onBodyPointerUp = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setMarquee(null);
    // A click on empty space (no drag) clears the selection.
    if (current.kind === 'marquee' && !current.moved && !current.additive) clearKeySelection();
  };

  const onRulerPointer = (event: PointerEvent) => {
    if (event.type === 'pointerdown') {
      if (event.button !== 0) return;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      drag.current = { kind: 'scrub', pointerId: event.pointerId };
    } else if (drag.current?.kind !== 'scrub' || drag.current.pointerId !== event.pointerId) {
      return;
    }
    setFrame(frameAt(event.clientX));
  };

  const setEasing = (value: Easing) => {
    pause();
    dispatch(setEasingCommand(timeline.get().selectedKeys, value));
  };
  const deleteSelected = () => {
    pause();
    dispatch(deleteKeysCommand(timeline.get().selectedKeys));
    clearKeySelection();
  };

  const toggleExpanded = (id: string) =>
    setExpanded((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  let index = -1;
  return (
    <section class="timeline-panel" aria-label="Timeline" ref={panelRef} style={{ '--lane-pad': `${PAD}px` }}>
      <div class="tl-header">
        <div class="tl-corner">
          <label class="tl-easing">
            Easing
            <select
              aria-label="Easing of selected keys"
              disabled={easing === null}
              value={easing === null || easing === 'mixed' ? '' : easing}
              onChange={(event) => setEasing(event.currentTarget.value as Easing)}
            >
              {(easing === null || easing === 'mixed') && <option value="">{easing === 'mixed' ? 'Mixed' : '—'}</option>}
              {EASINGS.map((value) => (
                <option key={value} value={value}>
                  {EASING_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          ref={rulerRef}
          class="tl-ruler"
          role="slider"
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={frame}
          aria-valuetext={`Frame ${frame} of ${last}`}
          tabIndex={0}
          onPointerDown={onRulerPointer}
          onPointerMove={onRulerPointer}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1;
            const moves: Record<string, number> = {
              ArrowLeft: frame - step,
              ArrowRight: frame + step,
              Home: 0,
              End: last,
            };
            if (event.key in moves) {
              event.preventDefault();
              setFrame(moves[event.key]);
            }
          }}
        >
          {labels.map((f) => (
            <span key={f} class="tl-ruler-label" style={{ left: `${xOf(f)}px` }} aria-hidden="true">
              {f}
            </span>
          ))}
          <span class="tl-playhead-head" style={{ left: `${xOf(frame)}px` }} aria-hidden="true" />
        </div>
      </div>

      <div
        class="tl-body"
        ref={bodyRef}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
        onContextMenu={(event) => {
          const diamond = diamondAt(event.target);
          if (!diamond) return;
          event.preventDefault();
          if (!allSelected(diamond.refs)) selectKeys(diamond.refs);
          const bounds = panelRef.current!.getBoundingClientRect();
          setMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
        }}
      >
        {rows.length === 0 && (
          <p class="tl-empty">Nothing is animated yet. Select a shape or camera and click a ◇ in the Inspector to add a key.</p>
        )}
        {rows.map((row) => (
          <div key={row.id} class={row.property ? 'tl-row tl-property' : 'tl-row'}>
            <div class="tl-label">
              {row.property ? (
                <span class="tl-property-name">{row.property}</span>
              ) : (
                <>
                  <button
                    type="button"
                    class="tl-expand"
                    aria-expanded={expanded.has(row.object.id)}
                    aria-label={`${expanded.has(row.object.id) ? 'Hide' : 'Show'} ${row.object.name} properties`}
                    disabled={row.diamonds.length === 0}
                    onClick={() => toggleExpanded(row.object.id)}
                  >
                    {expanded.has(row.object.id) ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    class={row.object.id === selectedId ? 'tl-shape is-selected' : 'tl-shape'}
                    onClick={() => dispatch(select(row.object.id))}
                  >
                    {row.object.name}
                  </button>
                </>
              )}
            </div>
            <div class="tl-lane">
              {row.diamonds.length === 0 && <span class="tl-hint">No keys yet</span>}
              {row.diamonds.map((diamond) => {
                index += 1;
                const state = allSelected(diamond.refs) ? ' is-selected' : someSelected(diamond.refs) ? ' is-partial' : '';
                return (
                  <span
                    key={diamond.frame}
                    class={`tl-key${diamond.hold ? ' is-hold' : ''}${row.property ? '' : ' is-summary'}${state}`}
                    data-diamond={index}
                    role="button"
                    aria-label={diamond.label}
                    aria-pressed={allSelected(diamond.refs)}
                    style={{ left: `${xOf(diamond.frame)}px` }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <span class="tl-playhead" style={{ left: `calc(var(--tl-label-width) + ${xOf(frame)}px)` }} aria-hidden="true" />
        {marquee && (
          <span
            class="tl-marquee"
            style={{ left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }}
          />
        )}
      </div>

      {menu && (
        <PopupMenu
          label="Key actions"
          position={menu}
          onClose={() => setMenu(null)}
          items={[
            ...EASINGS.map((value) => ({
              label: EASING_LABELS[value],
              checked: easing === value,
              onSelect: () => setEasing(value),
            })),
            { label: 'Delete keys', shortcut: 'Del', onSelect: deleteSelected },
          ]}
        />
      )}
    </section>
  );
}
