import { LottieExportError } from '../export/lottie/bake';
import {
  allFrames,
  lottieExport,
  lottieExportInChunks,
  type LottieExport,
  type LottieExportOptions,
  type ViewSource,
} from '../export/lottie/exportScene';
import { MAX_VIDEO_SIDE, VideoExportError, fitVideoSize } from '../export/videoSize';
import { exportZdogScript, scriptAnimates, scriptViewFromCamera, scriptViewFromFreeView } from '../export/zdogScript';
import { objectAtFrame } from '../model/evaluate';
import { findCamera } from '../model/scene';
import type { Scene } from '../model/types';
import { safeFileName } from '../model/names';
import { MAX_SCENE_FILE_BYTES, SCENE_FILE_EXTENSION, parseSceneFile, serializeScene } from '../model/sceneFile';
import { loadScene } from '../state/commands';
import { showNotice } from '../state/notice';
import { viewFromCamera, viewFromFreeView, type ViewSpec } from '../render/view';
import { dispatch, editor, freeView, lookThrough } from '../state/store';
import { currentFrame } from '../state/timeline';

/** Base name for saved and exported files: the last opened file's or example's, or "scene". */
let baseName = 'scene';

/** Saved and exported files are named after `name` from now on ("scene" by default, as for a new scene). */
export function setBaseName(name = 'scene'): void {
  baseName = safeFileName(name);
}

/** Starts a download of `text` (or a file's contents) as a file called `fileName`. */
function download(fileName: string, text: string | Blob, type: string): void {
  const url = URL.createObjectURL(typeof text === 'string' ? new Blob([text], { type }) : text);
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

/** Downloads `scene` as a scene file called `fileName`, without opening it. */
export function downloadSceneCopy(scene: Scene, fileName: string): void {
  download(fileName, serializeScene(scene), 'application/json');
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
  // It couldn't be drawn and was undone (the editor already said so).
  if (editor.get().scene !== result.scene) return;
  setBaseName(file.name.replace(/\.zeditor\.json$|\.json$/i, ''));
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
export function lottieText(settings: LottieSettings): LottieResult {
  const made = lottieJob(settings);
  if ('error' in made) return made;
  try {
    return asText(lottieExport(...made.job));
  } catch (error) {
    if (error instanceof LottieExportError) return { error: error.message };
    throw error;
  }
}

/**
 * As lottieText, worked out a few frames at a time so the page keeps
 * answering, and stopped (with an AbortError) when `signal` is. For the
 * dialog's size estimate.
 */
export async function lottieTextSoon(settings: LottieSettings, signal: AbortSignal): Promise<LottieResult> {
  const made = lottieJob(settings);
  if ('error' in made) return made;
  try {
    return asText(await lottieExportInChunks(...made.job, signal));
  } catch (error) {
    if (error instanceof LottieExportError) return { error: error.message };
    throw error;
  }
}

export type LottieResult =
  | { readonly text: string; readonly breaks: readonly number[]; readonly bakedInstead: boolean }
  | { readonly error: string };

const asText = ({ animation, breaks, bakedInstead }: LottieExport): LottieResult => ({ text: JSON.stringify(animation), breaks, bakedInstead });

/** What lottieExport is given for these settings, or why it can't be made. */
function lottieJob(settings: LottieSettings): { readonly job: [Scene, ViewSource, LottieExportOptions] } | { readonly error: string } {
  const { scene } = editor.get();
  let view: ViewSource | null;
  if (settings.camera === null) {
    view = viewFromFreeView(freeView.get(), settings.width, settings.height);
    if (!view) return { error: 'Width and height must be more than 0.' };
  } else {
    const camera = findCamera(scene, settings.camera);
    if (!camera) return { error: 'That camera is no longer in the scene.' };
    view = (frame) => viewFromCamera(objectAtFrame(camera, frame));
  }
  return { job: [scene, view, { background: settings.background, name: baseName, frames: lottieFrames(settings), mode: settings.mode }] };
}

/**
 * Downloads the scene as a Lottie file (`made` for these settings, if it's
 * already been worked out). Returns the file's size in bytes, or null (with a
 * notice) if it couldn't be made.
 */
export function saveLottie(settings: LottieSettings, made?: LottieResult): number | null {
  const result = made ?? lottieText(settings);
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

export interface VideoSettings {
  /** The camera to film through, or null for the free view at `width` x `height`. */
  readonly camera: string | null;
  readonly width: number;
  readonly height: number;
}

/** The view a video export films through, per frame, or why it can't. */
function videoView(settings: VideoSettings): { readonly viewAt: (frame: number) => ViewSpec } | { readonly error: string } {
  const { scene } = editor.get();
  if (settings.camera === null) {
    const view = viewFromFreeView(freeView.get(), settings.width, settings.height);
    return view ? { viewAt: () => view } : { error: 'Width and height must be more than 0.' };
  }
  const camera = findCamera(scene, settings.camera);
  if (!camera) return { error: 'That camera is no longer in the scene.' };
  // A picture bigger than a video can hold is filmed smaller, framed the same.
  const size = Math.max(camera.width, camera.height) > MAX_VIDEO_SIDE ? fitVideoSize(camera.width, camera.height) : null;
  return { viewAt: (frame) => viewFromCamera({ ...objectAtFrame(camera, frame), ...size }) };
}

/**
 * Makes the scene's whole animation as an MP4 video and downloads it.
 * Returns the file's size in bytes, or null (with a notice) if it couldn't
 * be made; throws an AbortError if `signal` stops it.
 */
export async function saveVideo(
  settings: VideoSettings,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<number | null> {
  const found = videoView(settings);
  if ('error' in found) {
    showNotice(`Couldn't export the video. ${found.error}`, 'error');
    return null;
  }
  const { scene } = editor.get();
  try {
    // The MP4 library loads only when a video is made.
    const { makeVideo } = await import('../export/video');
    const video = await makeVideo(scene, found.viewAt, { frames: allFrames(scene), fps: scene.settings.fps, onProgress, signal });
    const fileName = `${baseName}.mp4`;
    download(fileName, video, 'video/mp4');
    showNotice(`Saved ${fileName} to your downloads.`);
    return video.size;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error; // stopped
    if (error instanceof VideoExportError) {
      showNotice(`Couldn't export the video. ${error.message}`, 'error');
      return null;
    }
    // The browser's encoder can fail on its own (out of memory, say): say so rather than go quiet.
    console.error(error);
    showNotice("Couldn't export the video: the browser's video encoder stopped. A smaller size may work.", 'error');
    return null;
  }
}
