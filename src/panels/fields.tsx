import { useEffect, useRef, useState } from 'preact/hooks';
import { alphaPercent, isHexColor, toPickerHex, withAlphaOf, withAlphaPercent } from '../model/color';
import type { FaceValue } from '../model/types';
import { newGroup } from '../state/history';
import { isHistoryShortcut, LIVE_FIELD_ATTRIBUTE } from '../state/shortcuts';

/** Props for a text field whose keystrokes apply at once, so Ctrl+Z undoes the scene in it. */
const liveField = { [LIVE_FIELD_ATTRIBUTE]: '' };

/**
 * One editing session of a field, so all its changes undo as one step. A
 * session starts with the first change and lasts until `end()` (on blur, or
 * when a drag finishes).
 */
function useEditSession() {
  const group = useRef<string | null>(null);
  return {
    /** The current session's undo group, starting a session if none is open. */
    group: (): string => (group.current ??= newGroup()),
    end: (): void => {
      group.current = null;
    },
  };
}

/** Shows a number without float noise: 0.30000000000000004 -> "0.3". */
export function formatNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

/**
 * Parses what the user typed. Returns null for anything that isn't a finite
 * number within the field's rules, so half-typed text like "-" or "1." is
 * kept on screen without being applied.
 */
export function parseNumber(
  text: string,
  rules: { min?: number; max?: number; integer?: boolean } = {},
): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (rules.min !== undefined && value < rules.min) return null;
  if (rules.max !== undefined && value > rules.max) return null;
  if (rules.integer && !Number.isInteger(value)) return null;
  return value;
}

/** Adds `delta` to `value` and rounds away float noise, keeping within `min` and `max`. */
export function stepNumber(value: number, delta: number, min?: number, max?: number): number {
  const next = Math.round((value + delta) * 10000) / 10000;
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
}

/** Horizontal pixels of drag per step when dragging a number field's label. */
export const SCRUB_PIXELS_PER_STEP = 4;
/** Movement below this is a click on the label (focus the field), not a drag. */
export const SCRUB_THRESHOLD_PX = 3;

interface StepRules {
  readonly step: number;
  /** Bigger step used while Shift is held (defaults to ten steps). */
  readonly shiftStep?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

/** One step, or the bigger Shift step when `coarse`. Used by arrow keys and dragging alike. */
export function stepSize(rules: StepRules, coarse: boolean): number {
  return coarse ? (rules.shiftStep ?? rules.step * 10) : rules.step;
}

/**
 * The value after dragging a field's label `dx` pixels from where the drag
 * started at `start`. Works from the start value, so it never drifts.
 */
export function scrubValue(start: number, dx: number, rules: StepRules, coarse: boolean): number {
  const size = stepSize(rules, coarse);
  const steps = Math.trunc(dx / SCRUB_PIXELS_PER_STEP);
  const next = stepNumber(start, steps * size, rules.min, rules.max);
  return rules.integer ? Math.round(next) : next;
}

/** Where a label drag has got to: `offset` pixels right of where it started. */
export interface ScrubTrack {
  readonly offset: number;
  /** The pointer's `clientX` at the last move. */
  readonly lastX: number;
}

/**
 * Follows a label drag, one pointer move at a time.
 *
 * Whenever the cursor itself moves, that movement is used. Only while the
 * pointer is locked and the cursor stays put (a real lock hides the cursor
 * and freezes `clientX`, so it never stops at the screen edge) does the
 * movement come from `movementX`. Never trusting `movementX` otherwise
 * matters: some browsers report wild values for it, for example Chromium on
 * Linux when the mouse is driven by a test. If the lock ends mid-drag (Esc),
 * the drag carries on from where it had got to.
 */
export function trackScrub(
  track: ScrubTrack,
  clientX: number,
  movementX: number,
  locked: boolean,
): ScrubTrack {
  const moved = clientX !== track.lastX ? clientX - track.lastX : locked ? movementX : 0;
  return { offset: track.offset + moved, lastX: clientX };
}

/** How close to the window's left or right edge a label drag locks the pointer. */
export const EDGE_LOCK_PX = 24;

/**
 * Whether a label drag at `clientX` has reached (or passed) the edge of a
 * window `windowWidth` wide. Only then is the pointer locked: normal drags
 * keep a visible cursor and follow it exactly, and the lock only takes over
 * where the cursor would otherwise stop.
 */
export function atWindowEdge(clientX: number, windowWidth: number): boolean {
  return clientX <= EDGE_LOCK_PX || clientX >= windowWidth - EDGE_LOCK_PX;
}

/**
 * Hides the cursor and keeps reporting movement past the screen edge. Some
 * browsers refuse (or need a permission); dragging then simply stops at the
 * edge as before.
 */
function lockPointer(element: Element): void {
  try {
    const result: unknown = element.requestPointerLock();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // Not available here: plain dragging still works.
  }
}

function unlockPointer(): void {
  if (document.pointerLockElement) document.exitPointerLock();
}

interface NumberInputProps extends StepRules {
  readonly label: string;
  /** Shorter visible label, when `label` is only for screen readers. */
  readonly shortLabel?: string;
  readonly value: number;
  readonly suffix?: string;
  /** Show only the unit (e.g. "%"), not the label; screen readers still get `label`. */
  readonly hideLabel?: boolean;
  readonly disabled?: boolean;
  /** Extra class for the field, for layout. */
  readonly className?: string;
  /** `group` is the same for every change in one visit or drag, so they undo together. */
  readonly onCommit: (value: number, group: string) => void;
}

interface Scrub {
  readonly startValue: number;
  /** Every value set during this drag undoes as one step. */
  readonly group: string;
  track: ScrubTrack;
  dragging: boolean;
  /** Pointer lock was asked for (once per drag, at the window edge). */
  lockRequested: boolean;
}

/**
 * A number field that applies each valid keystroke immediately, keeps
 * half-typed text while focused, and steps with the arrow keys.
 *
 * Dragging its label (or unit, e.g. "°") left or right also changes the
 * value: one step per few pixels, bigger steps with Shift. If the drag
 * reaches the edge of the window, the cursor is hidden (pointer lock) so the
 * drag keeps going past the edge of the screen. A click on the label without
 * dragging focuses the field as usual.
 *
 * Everything typed during one visit to the field (focus to blur), and each
 * drag, is a single undo step. Ctrl+Z in the field undoes the scene, not
 * just the text, and drops any half-typed text.
 */
export function NumberInput(props: NumberInputProps) {
  const { label, shortLabel, value, step, shiftStep, min, max, integer, suffix, onCommit } = props;
  const { hideLabel, disabled, className } = props;
  const rules: StepRules = { step, shiftStep, min, max, integer };
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<Scrub | null>(null);
  const suppressClick = useRef(false);
  const typing = useEditSession();

  // Never leave the cursor hidden if the field goes away mid-drag.
  useEffect(
    () => () => {
      if (scrub.current?.dragging) unlockPointer();
    },
    [],
  );

  const commit = (next: number, group: string) => {
    if (next !== value) onCommit(next, group);
  };

  const scrubHandlers = {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0 || disabled) return;
      // A locked drag may end without a click, so never carry the flag into a new press.
      suppressClick.current = false;
      event.preventDefault(); // no text selection while dragging
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      const startValue = parseNumber(draft ?? '', rules) ?? value;
      // Typing before the drag is its own step; the drag is another.
      typing.end();
      scrub.current = {
        startValue,
        group: newGroup(),
        track: { offset: 0, lastX: event.clientX },
        dragging: false,
        lockRequested: false,
      };
    },
    onPointerMove: (event: PointerEvent) => {
      const current = scrub.current;
      if (!current) return;
      const target = event.currentTarget as Element;
      const locked = document.pointerLockElement === target;
      current.track = trackScrub(current.track, event.clientX, event.movementX, locked);
      const dx = current.track.offset;
      if (!current.dragging) {
        if (Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
        current.dragging = true;
      }
      if (!current.lockRequested && atWindowEdge(event.clientX, window.innerWidth)) {
        current.lockRequested = true;
        lockPointer(target);
      }
      setDraft(null);
      commit(scrubValue(current.startValue, dx, rules, event.shiftKey), current.group);
    },
    onPointerUp: () => {
      if (scrub.current?.dragging) {
        suppressClick.current = true;
        unlockPointer();
      }
      scrub.current = null;
    },
    onPointerCancel: () => {
      if (scrub.current?.dragging) unlockPointer();
      scrub.current = null;
    },
    onClick: (event: MouseEvent) => {
      // After a drag, don't let the <label> also focus the field.
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
      }
    },
  };

  const scrubTitle = disabled ? undefined : 'Drag left or right to change';
  return (
    <label class={['field', 'field-number', className].filter(Boolean).join(' ')}>
      {!hideLabel && (
        <span class="field-label scrub" title={scrubTitle} {...scrubHandlers}>
          {shortLabel ?? label}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        spellcheck={false}
        aria-label={label}
        {...liveField}
        disabled={disabled}
        value={draft ?? formatNumber(value)}
        onInput={(event) => {
          const text = event.currentTarget.value;
          setDraft(text);
          const parsed = parseNumber(text, rules);
          if (parsed !== null) commit(parsed, typing.group());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setDraft(null);
            return;
          }
          if (isHistoryShortcut(event)) {
            // The app's Undo/Redo runs next; show its result, not old typing.
            setDraft(null);
            typing.end();
            return;
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const base = parseNumber(draft ?? '', rules) ?? value;
          const size = stepSize(rules, event.shiftKey);
          const next = stepNumber(base, event.key === 'ArrowUp' ? size : -size, min, max);
          setDraft(formatNumber(next));
          commit(next, typing.group());
        }}
        onBlur={() => {
          setDraft(null);
          typing.end();
        }}
      />
      {suffix && (
        <span class="field-suffix scrub" title={scrubTitle} {...scrubHandlers}>
          {suffix}
        </span>
      )}
    </label>
  );
}

interface ColorInputProps {
  readonly label: string;
  /** Shorter visible label, when `label` is only for screen readers. */
  readonly shortLabel?: string;
  readonly value: string;
  readonly disabled?: boolean;
  /** `group` is the same for every change in one visit to the picker or hex box. */
  readonly onCommit: (value: string, group: string) => void;
}

/**
 * Color picker, hex text box and alpha (opacity) percentage. The hex box
 * also accepts `#rrggbbaa`. Dragging around the picker, one visit to the hex
 * box, or one visit to or drag of the alpha field is a single undo step.
 */
export function ColorInput({ label, shortLabel, value, disabled, onCommit }: ColorInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const session = useEditSession();
  /** null when the color isn't hex, so it has no alpha to edit here. */
  const alpha = alphaPercent(value);
  return (
    <div class="field field-color">
      <span class="field-label">{shortLabel ?? label}</span>
      <input
        type="color"
        aria-label={label}
        disabled={disabled}
        value={toPickerHex(value)}
        onInput={(event) => onCommit(withAlphaOf(event.currentTarget.value, value), session.group())}
        // "change" fires when the picker closes with a color chosen.
        onChange={session.end}
        onBlur={session.end}
      />
      <input
        type="text"
        class="field-hex"
        spellcheck={false}
        aria-label={`${label} hex`}
        {...liveField}
        disabled={disabled}
        value={draft ?? value}
        onInput={(event) => {
          const text = event.currentTarget.value.trim();
          setDraft(text);
          if (isHexColor(text)) onCommit(text, session.group());
        }}
        onKeyDown={(event) => {
          if (isHistoryShortcut(event)) {
            setDraft(null);
            session.end();
          }
        }}
        onBlur={() => {
          setDraft(null);
          session.end();
        }}
      />
      <NumberInput
        label={`${label} alpha`}
        hideLabel
        className="field-alpha"
        value={alpha ?? 100}
        suffix="%"
        step={1}
        min={0}
        max={100}
        integer
        disabled={disabled || alpha === null}
        onCommit={(percent, group) => onCommit(withAlphaPercent(value, percent), group)}
      />
    </div>
  );
}

interface CheckboxInputProps {
  readonly label: string;
  /** Fuller name for screen readers, when `label` alone is ambiguous. */
  readonly accessibleLabel?: string;
  readonly checked: boolean;
  readonly onCommit: (value: boolean) => void;
}

export function CheckboxInput({ label, accessibleLabel, checked, onCommit }: CheckboxInputProps) {
  return (
    <label class="field field-checkbox">
      <input
        type="checkbox"
        aria-label={accessibleLabel}
        checked={checked}
        onChange={(event) => onCommit(event.currentTarget.checked)}
      />
      <span class="field-label">{label}</span>
    </label>
  );
}

interface FaceInputProps {
  readonly label: string;
  readonly value: FaceValue;
  /** The shape's main color, used when the face has no color of its own. */
  readonly mainColor: string;
  readonly onCommit: (value: FaceValue, group?: string) => void;
}

/** A Box face: either the main color, or a color of its own. */
export function FaceInput({ label, value, mainColor, onCommit }: FaceInputProps) {
  const ownColor = typeof value === 'string';
  return (
    <div class="field field-face">
      <ColorInput
        label={`${label} face`}
        shortLabel={label}
        value={ownColor ? value : mainColor}
        disabled={!ownColor}
        onCommit={onCommit}
      />
      <CheckboxInput
        label="Own color"
        accessibleLabel={`${label} face has its own color`}
        checked={ownColor}
        onCommit={(checked) => onCommit(checked ? mainColor : true)}
      />
    </div>
  );
}
