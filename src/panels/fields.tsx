import { useRef, useState } from 'preact/hooks';
import type { FaceValue } from '../model/types';

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
  rules: { min?: number; integer?: boolean } = {},
): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (rules.min !== undefined && value < rules.min) return null;
  if (rules.integer && !Number.isInteger(value)) return null;
  return value;
}

/** Adds `delta` to `value` and rounds away float noise, respecting `min`. */
export function stepNumber(value: number, delta: number, min?: number): number {
  const next = Math.round((value + delta) * 10000) / 10000;
  return min !== undefined ? Math.max(min, next) : next;
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
  const next = stepNumber(start, steps * size, rules.min);
  return rules.integer ? Math.round(next) : next;
}

interface NumberInputProps extends StepRules {
  readonly label: string;
  /** Shorter visible label, when `label` is only for screen readers. */
  readonly shortLabel?: string;
  readonly value: number;
  readonly suffix?: string;
  readonly onCommit: (value: number) => void;
}

interface Scrub {
  readonly startX: number;
  readonly startValue: number;
  dragging: boolean;
}

/**
 * A number field that applies each valid keystroke immediately, keeps
 * half-typed text while focused, and steps with the arrow keys.
 *
 * Dragging its label (or unit, e.g. "°") left or right also changes the
 * value: one step per few pixels, bigger steps with Shift. A click on the
 * label without dragging focuses the field as usual.
 */
export function NumberInput(props: NumberInputProps) {
  const { label, shortLabel, value, step, shiftStep, min, integer, suffix, onCommit } = props;
  const rules: StepRules = { step, shiftStep, min, integer };
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<Scrub | null>(null);
  const suppressClick = useRef(false);

  const commit = (next: number) => {
    if (next !== value) onCommit(next);
  };

  const scrubHandlers = {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault(); // no text selection while dragging
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      const startValue = parseNumber(draft ?? '', { min, integer }) ?? value;
      scrub.current = { startX: event.clientX, startValue, dragging: false };
    },
    onPointerMove: (event: PointerEvent) => {
      const current = scrub.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      if (!current.dragging && Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
      current.dragging = true;
      setDraft(null);
      commit(scrubValue(current.startValue, dx, rules, event.shiftKey));
    },
    onPointerUp: () => {
      if (scrub.current?.dragging) suppressClick.current = true;
      scrub.current = null;
    },
    onPointerCancel: () => {
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

  return (
    <label class="field field-number">
      <span class="field-label scrub" title="Drag left or right to change" {...scrubHandlers}>
        {shortLabel ?? label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        spellcheck={false}
        aria-label={label}
        value={draft ?? formatNumber(value)}
        onInput={(event) => {
          const text = event.currentTarget.value;
          setDraft(text);
          const parsed = parseNumber(text, { min, integer });
          if (parsed !== null) commit(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setDraft(null);
            return;
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const base = parseNumber(draft ?? '', { min, integer }) ?? value;
          const size = stepSize(rules, event.shiftKey);
          const next = stepNumber(base, event.key === 'ArrowUp' ? size : -size, min);
          setDraft(formatNumber(next));
          commit(next);
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix && (
        <span class="field-suffix scrub" title="Drag left or right to change" {...scrubHandlers}>
          {suffix}
        </span>
      )}
    </label>
  );
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(text: string): boolean {
  return HEX_COLOR.test(text);
}

/**
 * The `#rrggbb` part of a color, for `<input type="color">` (which can't show
 * alpha or short forms). Non-hex colors fall back to black.
 */
export function toPickerHex(color: string): string {
  if (!isHexColor(color)) return '#000000';
  const digits = color.slice(1);
  if (digits.length === 3 || digits.length === 4) {
    return `#${[...digits.slice(0, 3)].map((d) => d + d).join('')}`.toLowerCase();
  }
  return `#${digits.slice(0, 6)}`.toLowerCase();
}

/** Applies a picker value but keeps any alpha the old color had (`#rrggbbaa`). */
export function withAlphaOf(picked: string, previous: string): string {
  if (isHexColor(previous) && previous.length === 9) return picked + previous.slice(7);
  return picked;
}

interface ColorInputProps {
  readonly label: string;
  /** Shorter visible label, when `label` is only for screen readers. */
  readonly shortLabel?: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onCommit: (value: string) => void;
}

/** Color picker plus a hex text box (which also accepts #rrggbbaa for transparency). */
export function ColorInput({ label, shortLabel, value, disabled, onCommit }: ColorInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div class="field field-color">
      <span class="field-label">{shortLabel ?? label}</span>
      <input
        type="color"
        aria-label={label}
        disabled={disabled}
        value={toPickerHex(value)}
        onInput={(event) => onCommit(withAlphaOf(event.currentTarget.value, value))}
      />
      <input
        type="text"
        class="field-hex"
        spellcheck={false}
        aria-label={`${label} hex`}
        disabled={disabled}
        value={draft ?? value}
        onInput={(event) => {
          const text = event.currentTarget.value.trim();
          setDraft(text);
          if (isHexColor(text)) onCommit(text);
        }}
        onBlur={() => setDraft(null)}
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
  readonly onCommit: (value: FaceValue) => void;
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
