import { exportZdogScript } from '../export/zdogScript';
import { MAX_SCENE_FILE_BYTES, SCENE_FILE_EXTENSION, parseSceneFile, serializeScene } from '../model/sceneFile';
import { loadScene } from '../state/commands';
import { showNotice } from '../state/notice';
import { camera, dispatch, editor } from '../state/store';

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
  const script = exportZdogScript(editor.get().scene, camera.get());
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
      ? `Copied the Zdog script to the clipboard and saved ${fileName} to your downloads.`
      : `Saved ${fileName} to your downloads. (The clipboard wasn't available.)`,
  );
}
