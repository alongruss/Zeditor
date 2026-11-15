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

/** What a finished Lottie export made: shown on the export card. */
export interface ExportSummary {
  readonly frames: readonly number[];
  readonly fps: number;
  readonly bytes: number;
  /** The camera it was filmed through, or null for the free view. */
  readonly camera: string | null;
  readonly width: number;
  readonly height: number;
}

/** The export card, while it's showing (after a Lottie export). */
export const exportDone: Store<ExportSummary | null> = createStore<ExportSummary | null>(null);

export function showExportDone(summary: ExportSummary): void {
  exportDone.dispatch(() => summary);
}

export function closeExportDone(): void {
  exportDone.dispatch(() => null);
}

export function useExportDone(): ExportSummary | null {
  return useStore(exportDone);
}
