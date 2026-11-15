import { createStore, useStore, type Store } from './store';

/**
 * Whether the Export Lottie dialog is open. It has two ways in (File ▾ and
 * the Inspector's Export ▾), so its state lives here rather than in either.
 */
export const lottieDialog: Store<boolean> = createStore(false);

export function openLottieDialog(): void {
  lottieDialog.dispatch(() => true);
}

export function closeLottieDialog(): void {
  lottieDialog.dispatch(() => false);
}

export function useLottieDialogOpen(): boolean {
  return useStore(lottieDialog);
}
