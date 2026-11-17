import { useEffect, useRef, useState } from 'preact/hooks';
import { lottieFrames, lottieText, saveLottie, type LottieSettings } from '../files/sceneFiles';
import { isAnimated } from '../model/evaluate';
import { findCamera } from '../model/scene';
import { showExportDone } from '../state/dialogs';
import { editor } from '../state/store';
import { currentFrame } from '../state/timeline';

/** Biggest picture side the dialog accepts, in pixels. */
const MAX_SIDE = 8192;

interface ExportLottieDialogProps {
  /** The viewport's size: the default picture size. */
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  /** The camera chosen at first (the one being looked through), or null for the free view. */
  readonly defaultCamera: string | null;
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
 * The size, and with keys, anything that kept the file from being smaller:
 * Lottie can't change which shapes are drawn in front of which within one
 * layer, and it moves points in straight lines between keys.
 */
function sizeNote(bytes: number, breaks: number, bakedInstead: boolean): string {
  const size = `About ${formatBytes(bytes)}.`;
  if (bakedInstead) {
    return `${size} Here keys come out bigger than baking (most of the picture turns or swings on every frame), so it's written baked.`;
  }
  if (breaks === 0) return size;
  const times = breaks === 1 ? 'once' : `${breaks} times`;
  return `${size} Shapes swap places in front of one another so often that the file starts a new layer ${times}.`;
}

/**
 * Export Lottie: the free view or a camera as a Lottie animation file, all
 * frames or just the current one. With keys (the default), the picture is
 * the same as baked on every frame, in a much smaller file; baked writes
 * every frame out.
 */
export function ExportLottieDialog({ defaultWidth, defaultHeight, defaultCamera, onClose }: ExportLottieDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState(String(Math.round(defaultWidth)));
  const [height, setHeight] = useState(String(Math.round(defaultHeight)));
  const [background, setBackground] = useState(true);
  const [frames, setFrames] = useState<LottieSettings['frames']>('all');
  const [mode, setMode] = useState<LottieSettings['mode']>('keys');
  const { scene } = editor.get();
  const [cameraId, setCameraId] = useState<string | null>(findCamera(scene, defaultCamera) ? defaultCamera : null);
  const camera = findCamera(scene, cameraId);
  const { duration, fps } = scene.settings;
  const animated = isAnimated(scene);
  const frame = currentFrame();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Esc, or close() below, ends up here.
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [onClose]);

  // A camera's picture size is its own (set in the Inspector).
  const w = camera ? camera.width : readSide(width);
  const h = camera ? camera.height : readSide(height);
  // Baking every frame can take a moment, so the estimate is worked out after
  // the dialog has opened (and again after each change), not while it opens.
  const [result, setResult] = useState<ReturnType<typeof lottieText> | null>(null);
  useEffect(() => {
    setResult(null);
    if (w === null || h === null) return;
    const timer = setTimeout(
      () => setResult(lottieText({ camera: cameraId, width: w, height: h, background, frames, mode })),
      0,
    );
    return () => clearTimeout(timer);
  }, [cameraId, w, h, background, frames, mode]);
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
          if (w === null || h === null) return;
          const settings = { camera: cameraId, width: w, height: h, background, frames, mode };
          const bytes = saveLottie(settings);
          if (bytes === null) return;
          dialogRef.current?.close();
          showExportDone({ frames: lottieFrames(settings), fps, bytes, camera: cameraId, width: w, height: h });
        }}
      >
        <h2 id="export-lottie-title" class="dialog-title">
          Export Lottie
        </h2>
        <p class="dialog-note">The scene as a Lottie animation file, filmed through the free view or a camera.</p>

        <label class="dialog-field dialog-source">
          View
          <select value={cameraId ?? ''} onChange={(e) => setCameraId(e.currentTarget.value || null)}>
            <option value="">Free view</option>
            {scene.cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

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
            <input
              type="number"
              min={1}
              max={MAX_SIDE}
              step={1}
              value={camera ? camera.width : width}
              disabled={camera !== undefined}
              onInput={(e) => setWidth(e.currentTarget.value)}
            />
          </label>
          <label class="dialog-field">
            Height
            <input
              type="number"
              min={1}
              max={MAX_SIDE}
              step={1}
              value={camera ? camera.height : height}
              disabled={camera !== undefined}
              onInput={(e) => setHeight(e.currentTarget.value)}
            />
          </label>
          <span class="dialog-unit">px{camera ? ` (${camera.name}'s picture size)` : ''}</span>
        </div>

        <label class="field field-checkbox">
          <input type="checkbox" checked={background} onChange={(e) => setBackground(e.currentTarget.checked)} />
          <span class="field-label">Background color (otherwise transparent)</span>
        </label>

        <fieldset class="dialog-choices">
          <legend>Mode</legend>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-mode" checked={mode === 'keys'} onChange={() => setMode('keys')} />
            <span class="field-label">Keys: the same picture, in a much smaller file</span>
          </label>
          <label class="field field-checkbox">
            <input type="radio" name="lottie-mode" checked={mode === 'baked'} onChange={() => setMode('baked')} />
            <span class="field-label">Baked: every frame written out</span>
          </label>
        </fieldset>

        <p class={problem ? 'dialog-error' : 'dialog-note'} role={problem ? 'alert' : undefined}>
          {problem ?? (result && 'text' in result ? sizeNote(result.text.length, result.breaks.length, result.bakedInstead) : 'Working out the size…')}
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
