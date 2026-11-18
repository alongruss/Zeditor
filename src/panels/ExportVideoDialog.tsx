import { useEffect, useRef, useState } from 'preact/hooks';
import { NO_H264, canMakeVideo, evenSide } from '../export/videoSize';
import { saveVideo } from '../files/sceneFiles';
import { findCamera } from '../model/scene';
import { editor } from '../state/store';

/** Biggest picture side the dialog accepts, in pixels (H.264 encoders top out around here). */
const MAX_SIDE = 4096;

interface ExportVideoDialogProps {
  /** The viewport's size: the default picture size. */
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  /** The camera chosen at first (the one being looked through), or null for the free view. */
  readonly defaultCamera: string | null;
  readonly onClose: () => void;
}

const readSide = (text: string): number | null => {
  const value = Number(text);
  return Number.isInteger(value) && value >= 2 && value <= MAX_SIDE ? value : null;
};

/**
 * Export video: the whole animation as an MP4 (H.264) video, filmed through
 * the free view or a camera, with the scene's background. Shows how far it
 * has got, and Cancel stops it. Says so, calmly, when the browser can't make
 * H.264 video.
 */
export function ExportVideoDialog({ defaultWidth, defaultHeight, defaultCamera, onClose }: ExportVideoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { scene } = editor.get();
  const [width, setWidth] = useState(String(evenSide(defaultWidth)));
  const [height, setHeight] = useState(String(evenSide(defaultHeight)));
  const [cameraId, setCameraId] = useState<string | null>(findCamera(scene, defaultCamera) ? defaultCamera : null);
  const camera = findCamera(scene, cameraId);
  const { duration, fps } = scene.settings;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('close', onClose);
      abort.current?.abort();
    };
  }, [onClose]);

  const w = camera ? camera.width : readSide(width);
  const h = camera ? camera.height : readSide(height);
  useEffect(() => {
    if (w === null || h === null) return;
    let current = true;
    void canMakeVideo(w, h, fps).then((ok) => current && setSupported(ok));
    return () => {
      current = false;
    };
  }, [w, h, fps]);

  const working = progress !== null;
  const rounded = w !== null && h !== null && (evenSide(w) !== w || evenSide(h) !== h);
  const problem =
    w === null || h === null
      ? `Width and height must be whole numbers from 2 to ${MAX_SIDE}.`
      : supported === false
        ? NO_H264
        : null;

  const exportVideo = async () => {
    if (w === null || h === null || working) return;
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: duration });
    try {
      const bytes = await saveVideo(
        { camera: cameraId, width: w, height: h },
        (done, total) => setProgress({ done, total }),
        controller.signal,
      );
      if (bytes !== null) dialogRef.current?.close();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  return (
    <dialog ref={dialogRef} class="dialog" aria-labelledby="export-video-title">
      <form
        method="dialog"
        // The dialog checks the sizes itself, and rounds odd ones down rather than refusing them.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void exportVideo();
        }}
      >
        <h2 id="export-video-title" class="dialog-title">
          Export video
        </h2>
        <p class="dialog-note">
          The whole animation as an MP4 video: {duration} frames, {(duration / fps).toFixed(1)} s at {fps} fps, on the
          scene's background color.
        </p>

        <label class="dialog-field dialog-source">
          View
          <select value={cameraId ?? ''} disabled={working} onChange={(e) => setCameraId(e.currentTarget.value || null)}>
            <option value="">Free view</option>
            {scene.cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div class="dialog-row">
          <label class="dialog-field">
            Width
            <input
              type="number"
              min={2}
              max={MAX_SIDE}
              step={2}
              value={camera ? camera.width : width}
              disabled={camera !== undefined || working}
              onInput={(e) => setWidth(e.currentTarget.value)}
            />
          </label>
          <label class="dialog-field">
            Height
            <input
              type="number"
              min={2}
              max={MAX_SIDE}
              step={2}
              value={camera ? camera.height : height}
              disabled={camera !== undefined || working}
              onInput={(e) => setHeight(e.currentTarget.value)}
            />
          </label>
          <span class="dialog-unit">px{camera ? ` (${camera.name}'s picture size)` : ''}</span>
        </div>
        {rounded && w !== null && h !== null && (
          <p class="dialog-note">
            Videos need even sizes, so it will be {evenSide(w)} x {evenSide(h)}.
          </p>
        )}

        {working ? (
          <div class="dialog-progress">
            <progress max={progress.total} value={progress.done} aria-label="Video progress" />
            <p class="dialog-note" role="status">
              Making frame {Math.min(progress.total, progress.done + 1)} of {progress.total}…
            </p>
          </div>
        ) : (
          problem && (
            <p class="dialog-error" role="alert">
              {problem}
            </p>
          )
        )}

        <div class="dialog-buttons">
          <button
            type="button"
            onClick={() => {
              if (working) abort.current?.abort();
              else dialogRef.current?.close();
            }}
          >
            {working ? 'Stop' : 'Cancel'}
          </button>
          <button type="submit" class="primary" disabled={problem !== null || working || supported === null}>
            Export
          </button>
        </div>
      </form>
    </dialog>
  );
}
