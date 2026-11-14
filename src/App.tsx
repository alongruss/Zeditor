import { useEffect } from 'preact/hooks';
import { Inspector } from './panels/Inspector';
import { SceneTree } from './panels/SceneTree';
import { isTypingTarget, shortcutCommand } from './state/shortcuts';
import { dispatch, editor } from './state/store';
import { Viewport } from './viewport/Viewport';

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const command = shortcutCommand(event, editor.get().selectedId);
      // Ctrl+D would otherwise bookmark the page, even with nothing selected.
      if (command || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd')) {
        event.preventDefault();
      }
      if (command) dispatch(command);
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
