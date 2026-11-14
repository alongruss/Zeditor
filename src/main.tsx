import { render } from 'preact';
import { App } from './App';
import { browserStorage, startAutosave } from './state/autosave';
import { editor } from './state/store';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Zeditor: missing #app element in index.html');

render(<App />, root);
startAutosave(editor, browserStorage());
