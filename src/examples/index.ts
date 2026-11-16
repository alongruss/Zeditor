import { parseSceneFile } from '../model/sceneFile';
import type { Scene } from '../model/types';
import type { FreeView } from '../viewport/freeView';
import nippu from './nippu.zeditor.json?raw';

/**
 * Example scenes in File ▾. Each is a scene file, read and checked like any
 * file you open, with the view it looks best from and its credit.
 */
export interface Example {
  readonly id: string;
  /** Shown in the File menu. */
  readonly title: string;
  /** Shown as a notice when the example opens. */
  readonly credit: string;
  /** The scene file's text. */
  readonly text: string;
  readonly freeView: FreeView;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'nippu',
    title: 'Example: Nippu',
    credit:
      '"Nippu": illustration by Robin Davey, made with Zdog by Dave DeSandro. Look through the Turntable camera to see it spin.',
    text: nippu,
    // The demo's own starting angle, zoomed out to fit the couple (128 units across).
    freeView: { rotate: { x: 0, y: -Math.PI / 4 }, zoom: 0.25 },
  },
];

/** The example's scene, read like an opened file (it throws if the file is broken: a build error). */
export function exampleScene(example: Example): Scene {
  const result = parseSceneFile(example.text);
  if (!result.ok) throw new Error(`The ${example.id} example doesn't open: ${result.error}`);
  return result.scene;
}
