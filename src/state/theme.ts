import { browserStorage } from './autosave';
import { createStore, useStore, type Store } from './store';

/** Light, dark, or whatever the system uses (the default). */
export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'zeditor.theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The saved choice, or "system" when there is none (or storage is blocked). */
export function readTheme(storage: ThemeStorage | null = browserStorage()): Theme {
  try {
    const saved = storage?.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export const theme: Store<Theme> = createStore<Theme>(readTheme());

/**
 * Puts the choice on <html data-theme>, which styles.css reads. "system"
 * removes it, so the colors follow prefers-color-scheme.
 */
export function applyTheme(choice: Theme): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function setTheme(choice: Theme, storage: ThemeStorage | null = browserStorage()): void {
  theme.dispatch(() => choice);
  applyTheme(choice);
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}

export function useTheme(): Theme {
  return useStore(theme);
}
