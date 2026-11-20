import { parseSceneFile } from '../model/sceneFile';
import type { Scene } from '../model/types';
import type { FreeView } from '../viewport/freeView';

/**
 * Example scenes in File ▾. Each is a scene file, read and checked like any
 * file you open, with the view it looks best from and its credit. The files
 * are fetched only when one is opened, so they don't add to the editor's
 * download.
 */
export interface Example {
  readonly id: string;
  /** Shown in the File menu. */
  readonly title: string;
  /** Shown as a notice when the example opens. */
  readonly credit: string;
  /** Fetches the scene file's text. */
  readonly load: () => Promise<string>;
  readonly freeView: FreeView;
  /** The camera to look through when it opens (otherwise the free view). */
  readonly lookThrough?: string;
}

const text = (module: Promise<{ default: string }>) => module.then((loaded) => loaded.default);

export const EXAMPLES: readonly Example[] = [
  {
    id: 'nippu',
    title: 'Example: Nippu',
    credit:
      '"Nippu": illustration by Robin Davey, made with Zdog by Dave DeSandro. Look through the Turntable camera to see it spin.',
    load: () => text(import('./nippu.zeditor.json?raw')),
    // The demo's own starting angle, zoomed out to fit the couple (128 units across).
    freeView: { rotate: { x: 0, y: -Math.PI / 4 }, zoom: 0.25 },
  },
  {
    id: 'nippu-walking',
    title: 'Example: Nippu, walking',
    credit:
      '"Nippu": illustration by Robin Davey, made with Zdog by Dave DeSandro; walk added in Zeditor. Press Play, or look through the Turntable camera.',
    load: () => text(import('./nippu-walking.zeditor.json?raw')),
    freeView: { rotate: { x: 0, y: -Math.PI / 4 }, zoom: 0.25 },
  },
  {
    id: 'all-the-bombs',
    title: 'Example: All the bombs at once',
    credit:
      'After "What If We Detonated All Nuclear Bombs at Once?" by Kurzgesagt – In a Nutshell (2019, youtube.com/watch?v=JyECrGp-Sw8): ' +
      'four of its scenes, remade in Zdog shapes as an unofficial fan tribute, not made or endorsed by Kurzgesagt. Press Play.',
    load: () => text(import('./all-the-bombs.zeditor.json?raw')),
    // The stockpile, from above. The Film camera cuts between four sets in a row.
    freeView: { rotate: { x: -0.45, y: 0.6 }, zoom: 0.4 },
    lookThrough: 'camera-1',
  },
];

/** The example's scene, read like an opened file (it throws if the file is broken: a build error). */
export async function exampleScene(example: Example): Promise<Scene> {
  const result = parseSceneFile(await example.load());
  if (!result.ok) throw new Error(`The ${example.id} example doesn't open: ${result.error}`);
  return result.scene;
}
