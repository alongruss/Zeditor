import { useEffect } from 'preact/hooks';
import { ErrorBoundary } from './panels/ErrorBoundary';
import { Inspector } from './panels/Inspector';
import { RecoveryDialog } from './panels/RecoveryDialog';
import {
  AddMenu,
  Dialogs,
  ExportMenu,
  FileMenu,
  UndoRedoButtons,
  ViewMenu,
} from './panels/Toolbar';
import { SceneTree } from './panels/SceneTree';
import { chooseSceneFile, saveScene } from './files/sceneFiles';
import { deleteKeysCommand } from './state/commands';
import { groupSelection, ungroupSelection } from './state/groupActions';
import { copySelectedKeys, keyClipboard, pasteCopiedKeys } from './state/keyClipboard';
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
      const shortcut = shortcutFor(event, editor.get().selectedIds, keysSelected, keyClipboard.get() !== null);
      if (!shortcut || !shortcutAllowedIn(event.target, shortcut)) return;
      event.preventDefault();
      if (shortcut === 'undo') undo();
      else if (shortcut === 'redo') redo();
      else if (shortcut === 'save') saveScene();
      else if (shortcut === 'open') chooseSceneFile();
      else if (shortcut === 'togglePlay') togglePlayback();
      else if (shortcut === 'firstFrame') setFrame(0);
      else if (shortcut === 'group') groupSelection();
      else if (shortcut === 'ungroup') ungroupSelection();
      else if (shortcut === 'lastFrame') setFrame(lastFrame());
      else if (shortcut === 'copyKeys') copySelectedKeys();
      else if (shortcut === 'pasteKeys') pasteCopiedKeys();
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
      <aside class="panel scene-panel" aria-labelledby="scene-tree-title">
        <div class="panel-header" role="group" aria-label="Scene tools">
          <span class="logo" aria-hidden="true">
            Z
          </span>
          <FileMenu />
          <span class="panel-header-gap" />
          <UndoRedoButtons />
        </div>
        <div class="panel-body">
          <AddMenu />
          <h2 class="panel-title" id="scene-tree-title">
            Scene tree
          </h2>
          <ErrorBoundary area="The scene tree">
            <SceneTree />
          </ErrorBoundary>
        </div>
      </aside>

      <main class="viewport-column">
        <ErrorBoundary area="The viewport">
          <Viewport />
        </ErrorBoundary>
        <div class="dock">
          <ErrorBoundary area="The timeline">
            <TransportBar />
            <TimelineArea />
          </ErrorBoundary>
        </div>
      </main>

      <aside class="panel inspector-panel" aria-labelledby="inspector-title">
        <div class="panel-header" role="group" aria-label="Inspector tools">
          <ViewMenu />
          <span class="panel-header-gap" />
          <ExportMenu />
        </div>
        <div class="panel-body">
          <h2 class="panel-title" id="inspector-title">
            Inspector
          </h2>
          <ErrorBoundary area="The Inspector">
            <Inspector />
          </ErrorBoundary>
        </div>
      </aside>
      <ErrorBoundary area="The export window">
        <Dialogs />
      </ErrorBoundary>
      <RecoveryDialog />
    </div>
  );
}
