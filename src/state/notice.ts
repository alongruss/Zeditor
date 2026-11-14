import { createStore, useStore, type Store } from './store';

/** A short message about something that just happened, e.g. "Saved scene.zeditor.json". */
export interface Notice {
  readonly text: string;
  /** Errors stay up longer and are announced straight away to screen readers. */
  readonly kind: 'info' | 'error';
}

const SHOW_MS = { info: 4000, error: 10000 } as const;

export const notice: Store<Notice | null> = createStore<Notice | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;

export function showNotice(text: string, kind: Notice['kind'] = 'info'): void {
  clearTimeout(timer);
  const shown: Notice = { text, kind };
  notice.dispatch(() => shown);
  timer = setTimeout(() => notice.dispatch((current) => (current === shown ? null : current)), SHOW_MS[kind]);
}

export function dismissNotice(): void {
  clearTimeout(timer);
  notice.dispatch(() => null);
}

export function useNotice(): Notice | null {
  return useStore(notice);
}
