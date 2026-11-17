import { LottieExportError } from '../export/lottie/bake';
import { allFrames, lottieExport } from '../export/lottie/exportScene';
import { exportZdogScript, scriptAnimates, scriptViewFromCamera, scriptViewFromFreeView } from '../export/zdogScript';
import { objectAtFrame } from '../model/evaluate';
import { findCamera } from '../model/scene';
import { MAX_SCENE_FILE_BYTES, SCENE_FILE_EXTENSION, parseSceneFile, serializeScene } from '../model/sceneFile';
import { loadScene } from '../state/commands';
import { showNotice } from '../state/notice';
import { viewFromCamera, viewFromFreeView, type ViewSpec } from '../render/view';
import { dispatch, editor, freeView, lookThrough } from '../state/store';
import { currentFrame } from '../state/timeline';

/** Base name for saved and exported files: the last opened file's, or "scene". */
let baseName = 'scene';

/** Starts a download of `text` as a file called `fileName`. */
function download(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the scene as a `.zeditor.json` file. */
export function saveScene(): void {
  const fileName = `${baseName}${SCENE_FILE_EXTENSION}`;
  download(fileName, serializeScene(editor.get().scene), 'application/json');
  showNotice(`Saved ${fileName} to your downloads.`);
}

/** Reads a scene file and, if it checks out, replaces the scene with it (undoable). */
export async function openFile(file: File): Promise<void> {
  if (file.size > MAX_SCENE_FILE_BYTES) {
    showNotice(`Couldn't open ${file.name}: it's too big for a scene file.`, 'error');
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    showNotice(`Couldn't read ${file.name}.`, 'error');
    return;
  }
  const result = parseSceneFile(text);
  if (!result.ok) {
    showNotice(`Couldn't open ${file.name}. ${result.error}`, 'error');
    return;
  }
  dispatch(loadScene(result.scene));
  baseName = file.name.replace(/\.zeditor\.json$|\.json$/i, '') || 'scene';
  showNotice(`Opened ${file.name}. Ctrl+Z goes back to the scene you had.`);
}

/** Asks for a scene file and opens it. */
export function chooseSceneFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${SCENE_FILE_EXTENSION},.json,application/json`;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void openFile(file);
  });
  input.click();
}

/** Copies the Zdog script to the clipboard and downloads it. */
export async function exportScript(): Promise<void> {
  const fileName = `${baseName}.zdog.js`;
  // Through the current view (the camera being looked through, or the free
  // view). An animated scene plays from frame 0; a still one is drawn as on
  // the current frame.
  const { scene } = editor.get();
  const camera = findCamera(scene, lookThrough.get());
  const view = camera ? scriptViewFromCamera(camera, currentFrame()) : scriptViewFromFreeView(freeView.get());
  const script = exportZdogScript(scene, view, currentFrame());
  const { fps, duration } = scene.settings;
  const plays = scriptAnimates(scene, view) ? ` It plays the animation (${duration} frames at ${fps} fps), looping.` : '';
  download(fileName, script, 'text/javascript');
  let copied = false;
  try {
    await navigator.clipboard.writeText(script);
    copied = true;
  } catch {
    // No clipboard access (e.g. permission refused): the download still has it.
  }
  showNotice(
    copied
      ? `Copied the Zdog script to the clipboard and saved ${fileName} to your downloads.${plays}`
      : `Saved ${fileName} to your downloads. (The clipboard wasn't available.)${plays}`,
  );
}

export interface LottieSettings {
  /**
   * The camera to film through (its picture size, following it as it
   * moves), or null for the free view at `width` x `height`.
   */
  readonly camera: string | null;
  /** Picture size in pixels, for the free view. */
  readonly width: number;
  readonly height: number;
  /** Draw the scene's background color (otherwise transparent). */
  readonly background: boolean;
  /** Every frame of the animation, or only the frame the playhead is on. */
  readonly frames: 'all' | 'current';
  /** Keys where the picture changes (much smaller), or every frame written out. */
  readonly mode: 'keys' | 'baked';
}

/**
 * The scene through the free view or a camera as Lottie JSON text, or why it
 * can't be made. With keys, also the frames where a new layer starts (see
 * export/lottie/keys.ts).
 */
export function lottieText(
  settings: LottieSettings,
): { readonly text: string; readonly breaks: readonly number[]; readonly bakedInstead: boolean } | { readonly error: string } {
  const { scene } = editor.get();
  let view: ViewSpec | ((frame: number) => ViewSpec) | null;
  if (settings.camera === null) {
    view = viewFromFreeView(freeView.get(), settings.width, settings.height);
    if (!view) return { error: 'Width and height must be more than 0.' };
  } else {
    const camera = findCamera(scene, settings.camera);
    if (!camera) return { error: 'That camera is no longer in the scene.' };
    view = (frame) => viewFromCamera(objectAtFrame(camera, frame));
  }
  try {
    const frames = lottieFrames(settings);
    const { animation, breaks, bakedInstead } = lottieExport(scene, view, {
      background: settings.background,
      name: baseName,
      frames,
      mode: settings.mode,
    });
    return { text: JSON.stringify(animation), breaks, bakedInstead };
  } catch (error) {
    if (error instanceof LottieExportError) return { error: error.message };
    throw error;
  }
}

/**
 * Downloads the scene as a Lottie file. Returns the file's size in bytes, or
 * null (with a notice) if it couldn't be made.
 */
export function saveLottie(settings: LottieSettings): number | null {
  const result = lottieText(settings);
  if ('error' in result) {
    showNotice(`Couldn't export Lottie. ${result.error}`, 'error');
    return null;
  }
  const fileName = `${baseName}.lottie.json`;
  download(fileName, result.text, 'application/json');
  showNotice(`Saved ${fileName} to your downloads.`);
  return new Blob([result.text]).size;
}

/** The frames a Lottie export bakes, for its settings. */
export function lottieFrames(settings: Pick<LottieSettings, 'frames'>): number[] {
  return settings.frames === 'all' ? allFrames(editor.get().scene) : [currentFrame()];
}
