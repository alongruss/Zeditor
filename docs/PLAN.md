# Zeditor rebuild plan

Agreed November 2026. This is the plan for turning the 2020 Zeditor prototype into a small editor
that works. It records what was wrong, what we decided, and what each of the five PRs must deliver.
(It was four PRs; undo/redo, with color alpha and shape opacity, became its own PR 3, and the gizmo
was moved ahead of saving and export.)

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
| Export dropped `0`/`false` values (so `stroke: false` was lost), only exported top-level shapes, could include the gizmo, and there was no import | PR 5 |
| Gizmo drag set the position to the drag distance in pixels, took direction from the sign of dx+dy (`NaN` when dx = −dy), and ignored the camera | PR 4 |
| Gizmos piled up or were not removed (items deleted from a list while looping over it) | PR 4 |

## Decisions

**Goal.** A small editor that works: add, select, move, rotate, scale and recolor shapes; save and
reload a scene; export Zdog JS. Desktop browsers only (current Chrome, Firefox, Edge, Safari) with
mouse and keyboard. Not a polished public product yet.

**Architecture**
- zdog 1.1.3 from npm, **unmodified**. Editor code lives in `src/` and uses only zdog's public API.
- The editor's state, `{ scene, selectedId }`, and the camera are the single source of truth. The
  SVG is output only; nothing is read back from it except which shape was clicked. The camera has a
  store of its own, outside the undo history: turning or zooming the view is never an undo step, and
  Undo never moves the camera.
- The editor layer is rebuilt rather than patched. The 2020 layout and feature list are the spec.
- Vite + TypeScript. Preact for the side panels (scene tree, Inspector, toolbar); the viewport stays
  plain imperative zdog. Plain CSS (no Sass).
- SVG renderer only in the editor, so the browser can tell us which element was clicked. The exported
  script can still target canvas.
- Undo history lives in the store next to the state: `{ present, past, future }`, where each past
  or future step is a `{ before, after }` pair of states. Commands stay pure functions of the state.

**Scene data**
- The scene is versioned JSON: `{ version, settings: { background, zoom }, shapes: [...] }`.
- v1 is a flat list of shapes, with no grouping. Composite shapes (Box, Cylinder, Cone, Hemisphere)
  select as one unit. The format leaves room for a `children` field later.
- Ids are stable and readable (`box-1`, `cone-2`). Names can be edited (double-click in the tree).
- Each shape type declares its fields (label, kind, step, default), and the Inspector is built from
  that list:
  - Every shape: position, rotation in degrees, scale, opacity, color, stroke, fill.
  - Every color has an alpha percentage next to it, stored in the hex value (`#rrggbbaa`).
  - Opacity (0–100 %) is stored on the shape. zdog has no opacity setting, so when the shape is
    drawn, and in the export, it is multiplied into the alpha of each of the shape's colors. Parts of
    a see-through Box or Cylinder therefore show through each other, as zdog draws them.
  - Sizes, where the type has them: width, height, depth, diameter, length, sides, cornerRadius.
  - Face colors for Box, and backface color for Cylinder, Cone and Hemisphere.

**Editing**
- Click a shape to select it; click empty space to deselect. Dragging anywhere other than a gizmo
  handle turns the camera **without** clearing the selection. A move of under 3 px counts as a click.
- Mouse wheel zooms (around the middle of the view, 0.25× to 8×); "Reset view" puts the camera back.
  The camera turns the same way zdog's own drag-to-rotate did: a drag across the shorter side of the
  view is a full turn. The view starts from the front, as in 2020.
- "Add" toolbar with all 9 shape types: a new shape appears at the origin and is selected.
  Delete/Backspace removes it, Ctrl+D duplicates it in place (the copy is selected, ready to move),
  and the right-click menu offers Duplicate and
  Delete. "New scene" asks for confirmation and can be undone.
- Undo/redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Cmd on a Mac, and toolbar buttons; up to 100 steps).
  Each step keeps the editor state from just before and just after a change, so Undo and Redo also
  re-select the shape that changed. Selecting is not a step.
  - A drag, one visit to a field (focus to blur), or dragging around the color picker is one step.
    A step that ends where it began (dragged out and back) is dropped.
  - Number, hex and alpha fields apply each keystroke at once, so Ctrl+Z in them undoes the scene.
    In the rename box, Ctrl+Z undoes typing as usual.
  - The shortcuts follow the physical key on non-Latin keyboard layouts (e.g. Hebrew).
- Shift snaps gizmo moves to whole units and rotation to 15°.
- Inspector number fields: arrow keys step by one step (0.5 units, 1°, 0.1 scale, 1 %). With Shift they
  step by 15° for rotation, or ten steps for everything else. Dragging a field's label or unit
  (e.g. "°") left or right also changes it, one step per 4 px, with the same Shift rule; a click on
  the label without dragging focuses the field. (Drag-to-change was added during PR 2.)
  Once a label drag starts, the pointer is locked (the cursor hides) so the drag keeps going past the
  edge of the screen; letting go or pressing Esc brings the cursor back. Where the browser refuses
  the lock, the drag stops at the screen edge. (Added during PR 4.)

**Gizmo**
- Drawn on its own overlay SVG above the scene, using the same camera. It can't be hidden behind
  shapes, isn't part of the scene, and is never exported. Only its handles respond to the mouse.
- Arrows point along the **world** X/Y/Z axes (red, green, blue; +Y points down, as in zdog). Your
  drag is projected onto the axis as it appears on screen, divided by zoom, and added to the position
  at drag start, so the point you grabbed stays under the pointer. An arrow is turned off (faded)
  when its axis points almost straight at the camera, so the result is never `NaN`.
- Each ring changes the matching X/Y/Z rotation value shown in the Inspector, by the angle your drag
  sweeps around the shape's center. zdog applies a shape's rotation Z first, then Y, then X, so the
  rings are drawn as gimbal rings: the X ring is around the fixed world X axis, the Y ring is tilted
  by the X rotation, and the Z ring by both. Each ring therefore turns the shape exactly around the
  axis it shows, and the gizmo and the Inspector always agree. A ring seen edge-on is turned off.
  Handles that follow the shape's own axes can come later.
- Arrows and rings keep the same size on screen whatever the zoom. The math lives in
  `src/viewport/gizmoMath.ts` and uses zdog's own `Vector.rotate`, so it matches what zdog draws.
- Scale is changed in the Inspector only (no scale handle in v1).
- Gizmo drags stop at the screen edge (no pointer lock there: you need to see the shape follow).

**Saving and export**
- Save downloads a `.zeditor.json` file; Open loads one. Opening a file with an unknown version shows
  an error. The scene autosaves to the browser so a reload keeps your work. The first visit, with no
  autosave, opens the 2020 nine-shape scene; "New scene" starts from empty.
- "Export Zdog JS" generates a complete script that runs when pasted into a page: an Illustration with
  the scene's background and zoom, one named `const` per shape, and a draw loop. It keeps `0`/`false`
  values, applies opacity the same way the editor does, and never includes the gizmo. It is copied to
  the clipboard and downloaded.

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
  `{ scene, selectedId }`. The camera stays inside zdog until PR 4 moves it into the store.
- The viewport creates, updates and removes zdog objects by id. Every SVG element a shape draws
  (including a Box's faces) is tagged with that shape's top-level id, so a click selects the whole shape.
- Preact panels: scene tree (select, double-click to rename), the Inspector built from field lists
  (with drag-to-change on number labels), the Add toolbar, Delete/Backspace, Ctrl+D, the right-click
  menu, and New scene.
- The viewport only redraws when something changes, instead of every frame.

**Done when:** every shape can be selected from the viewport and from the tree, and Inspector edits
change only that shape. Tests cover the shared-`translate` bug, the Inspector timing bug and the
Box-face selection bug.

### PR 3: Undo/redo, alpha and opacity (`rebuild/3-undo`)
- Undo/redo in the store, with groups so a drag or one visit to a field is one step.
- Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y and Undo/Redo toolbar buttons.
- An alpha percentage next to every color, and an Opacity field for every shape.
  (Alpha and opacity were asked for during this PR.)

**Done when:** every edit, add, delete, rename and New scene can be undone and redone; a label drag
and one visit to a field undo in one step; opacity fades every part of a shape.

### PR 4: Gizmo and camera (`rebuild/4-gizmo`)
- The overlay gizmo with move arrows and rotation rings, and Shift snapping.
- The camera in its own store; the editor's own click-versus-drag orbit replaces zdog's
  dragRotate; wheel zoom and Reset view.
- Label drags keep going past the screen edge (pointer lock). (Asked for during this PR.)
- Playwright tests: select, drag along an axis from different camera angles, rotate with a ring,
  Shift snapping, undo, wheel zoom and Reset view. (Save and reload join the flow in PR 5.)

**Done when:** a handle moves the shape smoothly along its axis from any camera angle and never
produces `NaN`, the gizmo is always visible, and each drag is one undo step.

### PR 5: Saving and export
- Save / Open / autosave, with version checking.
- The Zdog JS export.
- Add save and reload to the full Playwright flow.

**Done when:** a reload keeps your work, Save then Open gives the same scene, and a Vitest test runs
the exported script against zdog and gets the same shapes back.

## Later

**Lottie export.** The long-term aim is for the editor to export Lottie animations. Nothing is built
for it yet; it needs its own planning round. What is known so far:
- Lottie is 2D. Each frame would be drawn by zdog and its projected paths written out, so the 3D scene
  becomes 2D shape layers.
- It needs animation in the scene data: a timeline with keyframes for position, rotation, scale,
  colors and opacity. The scene's `version` field allows adding that.
- Shapes change front-to-back order as they turn, but Lottie layers keep a fixed order. That has to
  be handled (for example by splitting layers where the order changes).
- Opacity is already stored separately from colors, which matches Lottie's own opacity property.
