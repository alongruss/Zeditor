import { parseSceneFile, serializeScene } from '../model/sceneFile';
import type { Scene } from '../model/types';

/** Where the scene is kept in the browser between visits. */
export const AUTOSAVE_KEY = 'zeditor.autosave';

/**
 * Where an autosave that couldn't be read back is kept (e.g. one saved by a
 * newer version), so the starter scene never silently overwrites it.
 */
export const AUTOSAVE_BACKUP_KEY = 'zeditor.autosave.backup';

/** How long after the last change the scene is saved. */
export const AUTOSAVE_DELAY_MS = 300;

type ReadableStorage = Pick<Storage, 'getItem' | 'setItem'>;

let refusal: string | null = null;

/** Why the last autosave couldn't be restored, once (then null). */
export function takeAutosaveRefusal(): string | null {
  const reason = refusal;
  refusal = null;
  return reason;
}
type WritableStorage = Pick<Storage, 'setItem'>;

/**
 * The browser's localStorage, or null where it can't be used (private
 * windows, blocked site data, or no browser at all).
 */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The autosaved scene, or null if there is none or it can't be read. One that
 * can't be read is copied to AUTOSAVE_BACKUP_KEY first.
 */
export function readAutosave(storage: ReadableStorage | null): Scene | null {
  let text: string | null;
  try {
    text = storage?.getItem(AUTOSAVE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!text) return null;
  const result = parseSceneFile(text);
  if (result.ok) return result.scene;
  try {
    storage?.setItem(AUTOSAVE_BACKUP_KEY, text);
    refusal = `${result.error} It was kept as a backup in this browser.`;
  } catch {
    refusal = result.error;
  }
  return null;
}

/** Saves the scene; returns false if the browser refused (e.g. storage full). */
export function writeAutosave(storage: WritableStorage | null, scene: Scene): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUTOSAVE_KEY, serializeScene(scene));
    return true;
  } catch {
    return false;
  }
}

interface SceneSource {
  get(): { readonly scene: Scene };
  subscribe(listener: (state: { readonly scene: Scene }) => void): () => void;
}

/**
 * Saves the scene shortly after each change, and straight away when the
 * page is hidden or closed, so a reload keeps your work. Returns a function
 * that stops autosaving.
 */
export function startAutosave(source: SceneSource, storage: WritableStorage | null): () => void {
  if (!storage) return () => {};
  let saved = source.get().scene;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const { scene } = source.get();
    if (scene !== saved && writeAutosave(storage, scene)) saved = scene;
  };
  const unsubscribe = source.subscribe(({ scene }) => {
    if (scene === saved) return;
    clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);

  return () => {
    flush();
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
  };
}
