import { useEffect, useRef } from 'preact/hooks';
import { downloadSceneCopy } from '../files/sceneFiles';
import { serializeScene } from '../model/sceneFile';
import { starterScene } from '../model/starterScene';
import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY, browserStorage } from '../state/autosave';
import { useStuckScene } from '../state/recovery';

/**
 * Shown when the scene can't be drawn and there's no earlier one to go back
 * to (usually the scene restored from the last visit). Offers a copy of it
 * and a fresh start; the copy is also kept in the browser as a backup.
 */
export function RecoveryDialog() {
  const scene = useStuckScene();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (scene && dialog && !dialog.open) dialog.showModal();
  }, [scene]);

  if (!scene) return null;

  const startOver = () => {
    const storage = browserStorage();
    try {
      storage?.setItem(AUTOSAVE_BACKUP_KEY, serializeScene(scene));
      storage?.setItem(AUTOSAVE_KEY, serializeScene(starterScene()));
    } catch {
      // Storage refused: the reload still starts fresh if nothing was saved.
    }
    window.location.reload();
  };

  return (
    // Escape mustn't close it: behind it is a scene that can't be drawn.
    <dialog ref={dialogRef} class="dialog" aria-labelledby="recovery-title" onCancel={(event) => event.preventDefault()}>
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <h2 id="recovery-title" class="dialog-title">
          This scene couldn't be drawn
        </h2>
        <p class="dialog-note">
          Something in it trips up the editor. You can download a copy to keep, then start a new scene. A copy also stays
          in this browser as a backup.
        </p>
        <div class="dialog-buttons">
          <button type="button" onClick={() => downloadSceneCopy(scene, 'recovered-scene.zeditor.json')}>
            Download a copy
          </button>
          <button type="button" class="primary" onClick={startOver}>
            Start a new scene
          </button>
        </div>
      </form>
    </dialog>
  );
}
