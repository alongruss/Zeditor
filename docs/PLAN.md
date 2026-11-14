# Zeditor rebuild plan

Agreed November 2026. This is the plan for turning the 2020 Zeditor prototype into a small editor
that works. It records what was wrong, what we decided, and what each of the four PRs must deliver.

## Why rebuild

The 2020 editor (kept at the `legacy-2020` tag) was written *inside* a copy of zdog 1.1.2:
`boilerplate.js` built the whole UI when the library loaded, `illustration.js` read global
variables from the demo page, `Box` was changed to a different base class, and the Illustration
defaults were changed. So zdog could not be updated or reused, and most bugs came from two causes:
the editor and engine were tangled together, and the editor stored its state in SVG attributes.

### Bugs found, and the PR that fixes each

| Bug | Fixed in |
|---|---|
| Blank viewport on load: zoom became 0, so the SVG viewBox was `-Infinity` until the window was resized | PR 1 |
| Scene sized to the window, not its column, so shapes and the gizmo ran under the side panels | PR 1 |
| Inspector edits also changed shapes you had deselected (`selected` was `true`, `"true"`, `"false"` or `""`, and `"false"` counts as true); edited shapes ended up sharing one `translate` object | PR 2 |
| The Inspector only filled in if a redraw happened within a 100 ms timer, because it read the selection back from SVG attributes | PR 2 |
| Clicking a Box or Cylinder face selected the inner face, and then the gizmo moved a different top-level shape | PR 2 |
| Export dropped `0`/`false` values (so `stroke: false` was lost), only exported top-level shapes, could include the gizmo, and there was no import | PR 3 |
| Gizmo drag set the position to the drag distance in pixels, took direction from the sign of dx+dy (`NaN` when dx = −dy), and ignored the camera | PR 4 |
| Gizmos piled up or were not removed (items deleted from a list while looping over it) | PR 4 |

## Decisions

**Goal.** A small editor that works: add, select, move, rotate, scale and recolor shapes; save and
reload a scene; export Zdog JS. Desktop browsers only (current Chrome, Firefox, Edge, Safari) with
mouse and keyboard. Not a polished public product yet.

**Architecture**
- zdog 1.1.3 from npm, **unmodified**. Editor code lives in `src/` and uses only zdog's public API.
- The editor's state, `{ scene, selectedId, camera }`, is the single source of truth. The SVG is
  output only; nothing is read back from it except which shape was clicked.
- The editor layer is rebuilt rather than patched. The 2020 layout and feature list are the spec.
- Vite + TypeScript. Preact for the side panels (scene tree, Inspector, toolbar); the viewport stays
  plain imperative zdog. Plain CSS (no Sass).
- SVG renderer only in the editor, so the browser can tell us which element was clicked. The exported
  script can still target canvas.

**Scene data**
- The scene is versioned JSON: `{ version, settings: { background, zoom }, shapes: [...] }`.
- v1 is a flat list of shapes, with no grouping. Composite shapes (Box, Cylinder, Cone, Hemisphere)
  select as one unit. The format leaves room for a `children` field later.
- Ids are stable and readable (`box-1`, `cone-2`). Names can be edited (double-click in the tree).
- Each shape type declares its fields (label, kind, step, default), and the Inspector is built from
  that list:
  - Every shape: position, rotation in degrees, scale, color, stroke, fill.
  - Sizes, where the type has them: width, height, depth, diameter, length, sides, cornerRadius.
  - Face colors for Box, and backface color for Cylinder, Cone and Hemisphere.

**Editing**
- Click a shape to select it; click empty space to deselect. Dragging anywhere other than a gizmo
  handle turns the camera **without** clearing the selection. A move of under 3 px counts as a click.
- Mouse wheel zooms; "Reset view" puts the camera back.
- "Add" toolbar with all 9 shape types: a new shape appears at the origin and is selected.
  Delete/Backspace removes it, Ctrl+D duplicates it, and the right-click menu offers Duplicate and
  Delete. "New scene" asks for confirmation and can be undone.
- Undo/redo saves a copy of the scene after each change (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, up to 100
  steps). A drag, or one session of typing in a field, is one step.
- Shift snaps gizmo moves to whole units and rotation to 15°. In the Inspector, arrow keys step by
  0.5 units, or by 15° with Shift.

**Gizmo**
- Drawn on its own overlay SVG above the scene, using the same camera. It can't be hidden behind
  shapes, isn't part of the scene, and is never exported. Only its handles respond to the mouse.
- Arrows point along the **world** X/Y/Z axes. Your drag is projected onto the axis as it appears on
  screen, divided by zoom, and added to the position at drag start. A handle is turned off when its
  axis points almost straight at the camera, so the result is never `NaN`.
- Each ring changes the matching X/Y/Z rotation value shown in the Inspector, by the angle your drag
  sweeps around the shape's center. Once a shape is rotated on another axis, a ring won't turn it
  around a fixed world axis, but the gizmo and the Inspector always agree. Handles that follow the
  shape's own axes can come later.
- Scale is changed in the Inspector only (no scale handle in v1).

**Saving and export**
- Save downloads a `.zeditor.json` file; Open loads one. Opening a file with an unknown version shows
  an error. The scene autosaves to the browser so a reload keeps your work. The first visit, with no
  autosave, opens the 2020 nine-shape scene; "New scene" starts from empty.
- "Export Zdog JS" generates a complete script that runs when pasted into a page: an Illustration with
  the scene's background and zoom, one named `const` per shape, and a draw loop. It keeps `0`/`false`
  values and never includes the gizmo. It is copied to the clipboard and downloaded.

**Process**
- One branch and one PR per phase, merged before the next phase starts.
- Vitest covers the parts with no UI (scene data, save/load, export, undo, gizmo math). Playwright
  covers the editor in a real browser. Both run on every PR in GitHub Actions.
- Every merge to `main` deploys to GitHub Pages (`https://alongruss.github.io/Zeditor/`).

## Phases

### PR 1: Setup (`rebuild/1-setup`)
- Remove the copied zdog (`js/`, `dist/`, `tasks/`, `bower.json`), zdog's `.github/` files, the old
  ESLint config and `demos/`.
- Package renamed to `zeditor`. zdog 1.1.3 and Preact as dependencies; Vite, TypeScript, Vitest,
  Playwright and ESLint (typescript-eslint) for development.
- `index.html` + `src/`. The three-column layout is brought over to plain CSS.
- The viewport fits its own column (ResizeObserver) and never uses a zoom of 0.
- The nine-shape starter scene, created directly as zdog objects for now.
- CI workflow (type check, lint, Vitest, Playwright) and a Pages deploy workflow.

**Done when:** `npm run dev` shows the scene filling the middle column on first load, CI passes,
and the Pages site is live after merge.

### PR 2: Scene and selection
- Shape type definitions with their field lists; the scene data; a store holding
  `{ scene, selectedId, camera }`.
- The viewport creates, updates and removes zdog objects by id. Every SVG element a shape draws
  (including a Box's faces) is tagged with that shape's top-level id, so a click selects the whole shape.
- Preact panels: scene tree (select, double-click to rename), the Inspector built from field lists,
  the Add toolbar, Delete/Backspace, Ctrl+D, the right-click menu, and New scene.

**Done when:** every shape can be selected from the viewport and from the tree, and Inspector edits
change only that shape. Tests cover the shared-`translate` bug, the Inspector timing bug and the
Box-face selection bug.

### PR 3: Saving, undo, export
- Save / Open / autosave, with version checking.
- Undo/redo, with a way to group a drag or one field's typing into one step.
- The Zdog JS export.

**Done when:** a reload keeps your work, Save then Open gives the same scene, and a Vitest test runs
the exported script against zdog and gets the same shapes back.

### PR 4: Gizmo and camera
- The overlay gizmo with move arrows and rotation rings, and Shift snapping.
- Click versus drag handling, wheel zoom and Reset view.
- A full Playwright test: select, drag along an axis, rotate, undo, save, reload.

**Done when:** a handle moves the shape smoothly along its axis from any camera angle and never
produces `NaN`, the gizmo is always visible, and each drag is one undo step.
