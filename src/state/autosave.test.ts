import { describe, expect, it } from 'vitest';
import { updateShape } from '../model/scene';
import { serializeScene } from '../model/sceneFile';
import { starterScene } from '../model/starterScene';
import { AUTOSAVE_KEY, readAutosave, writeAutosave } from './autosave';

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
