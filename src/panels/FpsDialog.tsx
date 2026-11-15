import { useEffect, useRef } from 'preact/hooks';

interface FpsDialogProps {
  readonly from: number;
  readonly to: number;
  /** keepTiming: rescale keys and length so the animation lasts as long as before. */
  readonly onChoose: (choice: 'keepTiming' | 'keepFrames') => void;
  readonly onClose: () => void;
}

/**
 * Asked when the frame rate changes and the scene has keys: keys sit on
 * frames, so either they move to keep the animation's timing in seconds, or
 * they stay on their frames and it plays faster or slower.
 */
export function FpsDialog({ from, to, onChoose, onClose }: FpsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [onClose]);

  const choose = (choice: 'keepTiming' | 'keepFrames') => {
    onChoose(choice);
    dialogRef.current?.close();
  };
  const faster = to > from ? 'slower' : 'faster';

  return (
    <dialog ref={dialogRef} class="dialog" aria-labelledby="fps-dialog-title">
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <h2 id="fps-dialog-title" class="dialog-title">
          Change from {from} to {to} fps?
        </h2>
        <p class="dialog-note">
          The animation's keys sit on frames. Keep its timing in seconds (keys and length move to match, rounded to
          whole frames), or keep every key on its frame (the animation then plays {faster}).
        </p>
        <div class="dialog-buttons">
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" onClick={() => choose('keepFrames')}>
            Keep frames
          </button>
          <button type="button" class="primary" onClick={() => choose('keepTiming')}>
            Keep timing
          </button>
        </div>
      </form>
    </dialog>
  );
}
