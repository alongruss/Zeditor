import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateShape } from '../model/scene';
import { serializeScene } from '../model/sceneFile';
import { starterScene } from '../model/starterScene';
import type { Scene } from '../model/types';
import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY, AUTOSAVE_DELAY_MS, readAutosave, startAutosave, takeAutosaveRefusal, writeAutosave } from './autosave';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const refusing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('quota exceeded');
  },
};

describe('autosave', () => {
  it('writes the scene and reads it back', () => {
    const storage = memoryStorage();
    const scene = updateShape(starterScene(), 'box-1', { translate: { x: 7 } });
    expect(writeAutosave(storage, scene)).toBe(true);
    expect(storage.items.get(AUTOSAVE_KEY)).toBe(serializeScene(scene));
    expect(readAutosave(storage)).toEqual(scene);
  });

  it('gives nothing back when there is no autosave, or it is damaged', () => {
    const storage = memoryStorage();
    expect(readAutosave(storage)).toBeNull();
    storage.items.set(AUTOSAVE_KEY, '{"version":1,"shapes":[{"type":"Teapot"}]}');
    expect(readAutosave(storage)).toBeNull();
    storage.items.set(AUTOSAVE_KEY, 'garbage');
    expect(readAutosave(storage)).toBeNull();
  });

  it('copes with storage that is missing or refuses', () => {
    expect(readAutosave(null)).toBeNull();
    expect(writeAutosave(null, starterScene())).toBe(false);
    expect(readAutosave(refusing)).toBeNull();
    expect(writeAutosave(refusing, starterScene())).toBe(false);
  });
});

describe('autosave that cannot be restored', () => {
  it('is kept as a backup, and the reason is reported once', () => {
    const storage = memoryStorage();
    storage.items.set(AUTOSAVE_KEY, '{"version": 99, "shapes": []}');
    expect(readAutosave(storage)).toBeNull();
    expect(storage.items.get(AUTOSAVE_BACKUP_KEY)).toBe('{"version": 99, "shapes": []}');
    expect(takeAutosaveRefusal()).toMatch(/newer version of Zeditor.*kept as a backup/);
    expect(takeAutosaveRefusal()).toBeNull();
  });
});

describe('startAutosave', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A scene source like the editor's store, plus page events to listen to. */
  function setUp() {
    vi.useFakeTimers();
    const target = { addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', { ...target, visibilityState: 'visible' });
    let scene: Scene = starterScene();
    const listeners = new Set<(state: { scene: Scene }) => void>();
    const source = {
      get: () => ({ scene }),
      subscribe: (listener: (state: { scene: Scene }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const change = (next: Scene) => {
      scene = next;
      for (const listener of listeners) listener({ scene });
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 1);
    };
    return { source, change };
  }

  it("never saves a scene it's told to skip (one that couldn't be drawn)", () => {
    const { source, change } = setUp();
    const storage = memoryStorage();
    const broken = updateShape(starterScene(), 'box-1', { translate: { x: 9 } });
    startAutosave(source, storage, { skip: (scene) => scene === broken });
    change(broken);
    expect(storage.items.has(AUTOSAVE_KEY)).toBe(false);
    const fine = updateShape(starterScene(), 'box-1', { translate: { x: 2 } });
    change(fine);
    expect(storage.items.get(AUTOSAVE_KEY)).toBe(serializeScene(fine));
  });

  it('says once when the browser refuses to save, and again only after a save worked', () => {
    const { source, change } = setUp();
    let full = true;
    const items = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => {
        if (full) throw new Error('quota exceeded');
        items.set(key, value);
      },
    };
    const onWriteFailed = vi.fn();
    startAutosave(source, storage, { onWriteFailed });
    change(updateShape(starterScene(), 'box-1', { translate: { x: 1 } }));
    change(updateShape(starterScene(), 'box-1', { translate: { x: 2 } }));
    expect(onWriteFailed).toHaveBeenCalledTimes(1);
    full = false;
    change(updateShape(starterScene(), 'box-1', { translate: { x: 3 } }));
    expect(items.has(AUTOSAVE_KEY)).toBe(true);
    full = true;
    change(updateShape(starterScene(), 'box-1', { translate: { x: 4 } }));
    expect(onWriteFailed).toHaveBeenCalledTimes(2);
  });
});
