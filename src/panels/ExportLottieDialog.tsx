import { useEffect, useRef, useState } from 'preact/hooks';
import { lottieText, saveLottie, type LottieSettings } from '../files/sceneFiles';
import { isAnimated } from '../model/evaluate';
import { editor } from '../state/store';
import { currentFrame } from '../state/timeline';

/** Biggest picture side the dialog accepts, in pixels. */
const MAX_SIDE = 8192;

interface ExportLottieDialogProps {
  /** The viewport's size: the default picture size. */
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly onClose: () => void;
}

const readSide = (text: string): number | null => {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= MAX_SIDE ? value : null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Export Lottie: the current view as a Lottie animation file, "baked": every
 * frame drawn exactly as zdog draws it. All frames, or just the current one.
 * The keyframed mode comes later.
 */
export function ExportLottieDialog({ defaultWidth, defaultHeight, onClose }: ExportLottieDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState(String(Math.round(defaultWidth)));
  const [height, setHeight] = useState(String(Math.round(defaultHeight)));
  const [background, setBackground] = useState(true);
  const [frames, setFrames] = useState<LottieSettings['frames']>('all');
  const { duration, fps } = editor.get().scene.settings;
  const animated = isAnimated(editor.get().scene);
  const frame = currentFrame();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Esc, or close() below, ends up here.
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [onClose]);

  const w = readSide(width);
  const h = readSide(height);
  // Baking every frame can take a moment, so the estimate is worked out after
  // the dialog has opened (and again after each change), not while it opens.
  const [result, setResult] = useState<ReturnType<typeof lottieText> | null>(null);
  useEffect(() => {
    setResult(null);
    if (w === null || h === null) return;
    const timer = setTimeout(() => setResult(lottieText({ width: w, height: h, background, frames })), 0);
    return () => clearTimeout(timer);
  }, [w, h, background, frames]);
  const problem =
    w === null || h === null
      ? `Width and height must be whole numbers from 1 to ${MAX_SIDE}.`
      : result && 'error' in result
        ? result.error
        : null;

  return (
    <dialog ref={dialogRef} class="dialog" aria-labelledby="export-lottie-title">
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (w !== null && h !== null && saveLottie({ width: w, height: h, background, frames })) {
            dialogRef.current?.close();
          }
        }}
      >
        <h2 id="export-lottie-title" class="dialog-title">
          Export Lottie
        </h2>
        <p class="dialog-note">The current view, as a Lottie animation file.</p>

        <fieldset class="dialog-choices">
          <legend>Frames</legend>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-frames" checked={frames === 'all'} onChange={() => setFrames('all')} />
            <span class="field-label">
              All {duration} frames ({(duration / fps).toFixed(1)} s at {fps} fps)
              {animated ? '' : ', nothing is animated yet'}
            </span>
          </label>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-frames" checked={frames === 'current'} onChange={() => setFrames('current')} />
            <span class="field-label">Only the current frame ({frame})</span>
          </label>
        </fieldset>

        <div class="dialog-row">
          <label class="dialog-field">
            Width
            <input type="number" min={1} max={MAX_SIDE} step={1} value={width} onInput={(e) => setWidth(e.currentTarget.value)} />
          </label>
          <label class="dialog-field">
            Height
            <input type="number" min={1} max={MAX_SIDE} step={1} value={height} onInput={(e) => setHeight(e.currentTarget.value)} />
          </label>
          <span class="dialog-unit">px</span>
        </div>

        <label class="field field-checkbox">
          <input type="checkbox" checked={background} onChange={(e) => setBackground(e.currentTarget.checked)} />
          <span class="field-label">Background color (otherwise transparent)</span>
        </label>

        <fieldset class="dialog-choices">
          <legend>Mode</legend>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-mode" checked />
            <span class="field-label">Baked: drawn exactly as here, frame by frame</span>
          </label>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-mode" disabled />
            <span class="field-label">Keyframed layers (coming later)</span>
          </label>
        </fieldset>

        <p class={problem ? 'dialog-error' : 'dialog-note'} role={problem ? 'alert' : undefined}>
          {problem ?? (result && 'text' in result ? `About ${formatBytes(result.text.length)}.` : 'Working out the size…')}
        </p>

        <div class="dialog-buttons">
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={problem !== null}>
            Export
          </button>
        </div>
      </form>
    </dialog>
  );
}
