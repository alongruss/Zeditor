import { render } from 'preact';
import { App } from './App';
import { ErrorBoundary } from './panels/ErrorBoundary';
import { browserStorage, startAutosave, takeAutosaveRefusal } from './state/autosave';
import { showNotice } from './state/notice';
import { failedToDraw, SNAG_NOTICE } from './state/recovery';
import { editor } from './state/store';
import { startFirstKeyTip } from './state/firstKeyTip';
import { applyTheme, theme } from './state/theme';
import { startTimeline } from './state/timeline';
// Figtree, bundled with the app (no request to Google at runtime).
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Zeditor: missing #app element in index.html');

// Anything that goes wrong outside a panel (a button's handler, a file being
// read) gets a calm note instead of failing silently. Not the same note over
// and over, though.
let lastSnag = 0;
const onSnag = (message: string) => {
  // Browsers report this one harmlessly when a layout settles; it isn't a fault.
  if (message.includes('ResizeObserver loop')) return;
  const now = Date.now();
  if (now - lastSnag < 5000) return;
  lastSnag = now;
  showNotice(SNAG_NOTICE, 'error');
};
window.addEventListener('error', (event) => onSnag(String(event.message)));
window.addEventListener('unhandledrejection', (event) => onSnag(String(event.reason)));

// Before the first paint, so a saved dark theme never flashes light.
applyTheme(theme.get());
render(
  <ErrorBoundary area="The editor">
    <App />
  </ErrorBoundary>,
  root,
);
startAutosave(editor, browserStorage(), {
  skip: failedToDraw,
  onWriteFailed: () =>
    showNotice("Couldn't keep a backup of your scene: this browser's storage is full. Save it to a file to be safe.", 'error'),
});
startTimeline();
startFirstKeyTip();

const refusal = takeAutosaveRefusal();
if (refusal) showNotice(`Couldn't restore your last session. ${refusal}`, 'error');
