import { useEffect } from 'preact/hooks';
import { Inspector } from './panels/Inspector';
import { SceneTree } from './panels/SceneTree';
import { chooseSceneFile, saveScene } from './files/sceneFiles';
import { deleteKeysCommand } from './state/commands';
import { shortcutAllowedIn, shortcutFor } from './state/shortcuts';
import {
  clearKeySelection,
  currentFrame,
  lastFrame,
  setFrame,
  timeline,
  togglePlayback,
  useTimeline,
} from './state/timeline';

/** The timeline panel, when it's open (its own component, so the app doesn't redraw on every frame). */
function TimelineArea() {
  const { panelOpen } = useTimeline();
  return panelOpen ? <TimelinePanel /> : null;
}
import { dispatch, editor, redo, undo } from './state/store';
import { TimelinePanel } from './panels/TimelinePanel';
import { TransportBar } from './panels/TransportBar';
import { Viewport } from './viewport/Viewport';

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const keysSelected = timeline.get().selectedKeys.length > 0;
      const shortcut = shortcutFor(event, editor.get().selectedId, keysSelected);
      if (!shortcut || !shortcutAllowedIn(event.target, shortcut)) return;
      event.preventDefault();
      if (shortcut === 'undo') undo();
      else if (shortcut === 'redo') redo();
      else if (shortcut === 'save') saveScene();
      else if (shortcut === 'open') chooseSceneFile();
      else if (shortcut === 'togglePlay') togglePlayback();
      else if (shortcut === 'firstFrame') setFrame(0);
      else if (shortcut === 'lastFrame') setFrame(lastFrame());
      else if (shortcut === 'deleteKeys') {
        dispatch(deleteKeysCommand(timeline.get().selectedKeys));
        clearKeySelection();
      } else if (typeof shortcut === 'object') setFrame(currentFrame() + shortcut.stepFrames);
      else dispatch(shortcut);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export function App() {
  useKeyboardShortcuts();
  return (
    <div class="app">
      <aside class="panel" aria-labelledby="scene-tree-title">
        <h2 class="panel-title" id="scene-tree-title">
          Scene tree
        </h2>
        <SceneTree />
      </aside>

      <main class="viewport-column">
        <Viewport />
        <TransportBar />
        <TimelineArea />
      </main>

      <aside class="panel" aria-labelledby="inspector-title">
        <h2 class="panel-title" id="inspector-title">
          Inspector
        </h2>
        <Inspector />
      </aside>
    </div>
  );
}
