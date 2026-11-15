import { render } from 'preact';
import { App } from './App';
import { browserStorage, startAutosave, takeAutosaveRefusal } from './state/autosave';
import { showNotice } from './state/notice';
import { editor } from './state/store';
import { startTimeline } from './state/timeline';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Zeditor: missing #app element in index.html');

render(<App />, root);
startAutosave(editor, browserStorage());
startTimeline();

const refusal = takeAutosaveRefusal();
if (refusal) showNotice(`Couldn't restore your last session. ${refusal}`, 'error');
