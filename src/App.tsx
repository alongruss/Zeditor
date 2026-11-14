import { useEffect } from 'preact/hooks';
import { Inspector } from './panels/Inspector';
import { SceneTree } from './panels/SceneTree';
import { chooseSceneFile, saveScene } from './files/sceneFiles';
import { shortcutAllowedIn, shortcutFor } from './state/shortcuts';
import { dispatch, editor, redo, undo } from './state/store';
import { Viewport } from './viewport/Viewport';

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const shortcut = shortcutFor(event, editor.get().selectedId);
      if (!shortcut || !shortcutAllowedIn(event.target, shortcut)) return;
      event.preventDefault();
      if (shortcut === 'undo') undo();
      else if (shortcut === 'redo') redo();
      else if (shortcut === 'save') saveScene();
      else if (shortcut === 'open') chooseSceneFile();
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
