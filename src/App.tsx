import { Viewport } from './viewport/Viewport';

export function App() {
  return (
    <div class="app">
      <aside class="panel" aria-labelledby="scene-tree-title">
        <h2 class="panel-title" id="scene-tree-title">
          Scene tree
        </h2>
        <p class="panel-empty">Shape list coming soon.</p>
      </aside>

      <main class="viewport-column">
        <Viewport />
      </main>

      <aside class="panel" aria-labelledby="inspector-title">
        <h2 class="panel-title" id="inspector-title">
          Inspector
        </h2>
        <p class="panel-empty">Shape editing coming soon.</p>
      </aside>
    </div>
  );
}
