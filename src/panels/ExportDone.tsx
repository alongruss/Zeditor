import { useEffect, useRef } from 'preact/hooks';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { findCamera } from '../model/scene';
import { rootTranslate, viewFromCamera, viewFromFreeView, type ViewSpec } from '../render/view';
import { buildZdogGraph } from '../render/zdogGraph';
import { closeExportDone, useExportDone, type ExportSummary } from '../state/dialogs';
import { prefersReducedMotion } from '../state/motion';
import { editor, freeView } from '../state/store';
import { Zdog } from '../zdog';

/** The preview's longer side, in CSS pixels. */
const PREVIEW_SIDE = 96;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}`;
  return (bytes / (1024 * 1024)).toFixed(1);
}

function bytesUnit(bytes: number): string {
  if (bytes < 1024) return 'bytes';
  return bytes < 1024 * 1024 ? 'KB' : 'MB';
}

/**
 * The export's picture, small: the scene as it was exported (through the
 * same camera or free view), looping at the scene's frame rate. With reduced
 * motion it shows the first frame only.
 */
function Preview({ summary }: { summary: ExportSummary }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = PREVIEW_SIDE / Math.max(summary.width, summary.height);
  const width = Math.max(1, Math.round(summary.width * scale));
  const height = Math.max(1, Math.round(summary.height * scale));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const { scene } = editor.get();
    const camera = findCamera(scene, summary.camera);
    const free = freeView.get();

    const viewAt = (frame: number): ViewSpec | null => {
      if (camera) {
        const own = viewFromCamera(objectAtFrame(camera, frame));
        return { ...own, pixelsPerUnit: own.pixelsPerUnit * scale * ratio };
      }
      return viewFromFreeView(free, canvas.width, canvas.height);
    };

    const draw = (frame: number) => {
      const view = viewAt(frame);
      if (!view) return;
      const illo = new Zdog.Illustration({
        element: canvas,
        resize: false,
        zoom: view.pixelsPerUnit,
        rotate: view.rotate,
        translate: rootTranslate(view),
      });
      // The same graph the export draws, so shapes sit where their groups put them.
      buildZdogGraph(sceneAtFrame(scene, frame), illo);
      illo.updateRenderGraph();
    };

    const frames = summary.frames;
    draw(frames[0] ?? 0);
    const loops = frames.length > 1 && !prefersReducedMotion();
    // For tests and debugging: whether the preview is playing or still.
    canvas.dataset.playing = String(loops);
    if (!loops) return;
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % frames.length;
      draw(frames[index]);
    }, 1000 / summary.fps);
    return () => clearInterval(timer);
  }, [summary]);

  return (
    <canvas
      ref={ref}
      class="export-preview"
      style={{ width: `${width}px`, height: `${height}px`, background: editor.get().scene.settings.background }}
      aria-hidden="true"
    />
  );
}

/**
 * After a Lottie export: a calm card at the bottom of the scene with what
 * was made (frames, seconds, size) and a looping preview. It takes no focus
 * and isn't announced (the "Saved …" notice already is). Done, Escape or the
 * next change to the scene closes it.
 */
export function ExportDone() {
  const summary = useExportDone();

  useEffect(() => {
    if (!summary) return;
    const scene = editor.get().scene;
    const unsubscribe = editor.subscribe((state) => {
      if (state.scene !== scene) closeExportDone();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeExportDone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [summary]);

  if (!summary) return null;
  const seconds = summary.frames.length / summary.fps;
  return (
    <section class="export-done" aria-labelledby="export-done-title">
      <Preview summary={summary} />
      <div class="export-done-body">
        <div class="export-done-top">
          <h2 id="export-done-title" class="export-done-title">
            Export done
          </h2>
          <button type="button" class="export-done-close" onClick={closeExportDone}>
            Done
          </button>
        </div>
        <div class="export-done-numbers">
          <div>
            <span class="export-number">{summary.frames.length}</span>
            <span class="export-unit">{summary.frames.length === 1 ? 'frame' : 'frames'}</span>
          </div>
          <div>
            <span class="export-number">{seconds.toFixed(1)}</span>
            <span class="export-unit">seconds</span>
          </div>
          <div>
            <span class="export-number">{formatBytes(summary.bytes)}</span>
            <span class="export-unit">{bytesUnit(summary.bytes)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
