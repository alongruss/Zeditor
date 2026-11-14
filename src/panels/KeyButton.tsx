import type { KeyState } from '../model/animation';

export type KeyButtonState = KeyState | 'mixed';

const ACTION: Record<KeyButtonState, string> = {
  none: 'Animate',
  track: 'Add key for',
  mixed: 'Add key for',
  key: 'Remove key for',
};

const STATE: Record<KeyButtonState, string> = {
  none: 'not animated',
  track: 'animated, no key on this frame',
  mixed: 'some parts keyed on this frame',
  key: 'key on this frame',
};

interface KeyButtonProps {
  /** What the button keys, e.g. "Position" or "Width". */
  readonly label: string;
  readonly state: KeyButtonState;
  readonly frame: number;
  readonly onToggle: () => void;
}

/**
 * The keyframe button beside an Inspector field: a diamond that is grey when
 * the value isn't animated, outlined when it is but has no key on this frame,
 * and filled when it has one. Clicking it adds the key (holding the current
 * value) or removes it.
 */
export function KeyButton({ label, state, frame, onToggle }: KeyButtonProps) {
  const text = `${ACTION[state]} ${label} at frame ${frame} (${STATE[state]})`;
  return (
    <button
      type="button"
      class={`key-button key-${state}`}
      aria-label={text}
      title={text}
      onClick={(event) => {
        event.preventDefault(); // inside a <label>, don't also focus the field
        onToggle();
      }}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1 L11 6 L6 11 L1 6 Z" />
        {state === 'mixed' && <path class="key-half" d="M6 1 L11 6 L6 11 Z" />}
      </svg>
    </button>
  );
}
