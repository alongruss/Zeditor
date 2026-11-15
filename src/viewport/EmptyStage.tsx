import { chooseSceneFile } from '../files/sceneFiles';
import { starterScene } from '../model/starterScene';
import { loadScene } from '../state/commands';
import { dispatch } from '../state/store';

/** Opens the Scene panel's Add menu (the one picker, so there is one way to add). */
function openAddMenu(): void {
  document.querySelector<HTMLButtonElement>('.add-menu > button')?.click();
}

/**
 * Shown over an empty scene: a calm question and three ways to begin. Only
 * the buttons take the pointer, so dragging and right-clicking the scene
 * still work around them.
 */
export function EmptyStage() {
  return (
    <div class="empty-stage">
      <h2 class="empty-stage-title">What will you make today?</h2>
      <p class="empty-stage-note">Start with a shape, open a file, or begin from the sample scene.</p>
      <div class="empty-stage-choices">
        <button type="button" class="start-tile" style={{ background: 'var(--sticker-sunflower)' }} onClick={openAddMenu}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="13" />
            <path d="M20 13v14M13 20h14" />
          </svg>
          Add a shape
          <small>Pick from nine shapes</small>
        </button>
        <button type="button" class="start-tile" style={{ background: 'var(--sticker-lime)' }} onClick={chooseSceneFile}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 12h10l3 3h15v17H6z" />
          </svg>
          Open a file
          <small>A .zeditor.json scene</small>
        </button>
        <button
          type="button"
          class="start-tile"
          style={{ background: 'var(--sticker-sky)' }}
          onClick={() => dispatch(loadScene(starterScene()))}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 6 L33 13 L20 20 L7 13 Z" />
            <path d="M7 13 L20 20 L20 34 L7 27 Z" />
            <path d="M20 20 L33 13 L33 27 L20 34 Z" />
          </svg>
          Start from the sample scene
          <small>You can undo this</small>
        </button>
      </div>
    </div>
  );
}
