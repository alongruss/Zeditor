import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the same build works at the root of a dev server
  // and under /Zeditor/ on GitHub Pages.
  base: './',
  plugins: [preact()],
});
