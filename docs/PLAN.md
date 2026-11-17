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
- The scene is versioned JSON: `{ version, settings: { background }, shapes: [...] }`. (Zoom was
  planned as a scene setting; it turned out to belong to the camera, which the export uses instead.)
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
  When a label drag reaches the left or right edge of the window, the pointer is locked (the cursor
  hides) so the drag keeps going past the edge of the screen; letting go or pressing Esc brings the
  cursor back. Normal drags never lock. Where the browser refuses the lock, the drag stops at the
  screen edge. (Added during PR 4; locking only at the edge since the CI fix after it, because
  Chromium on Linux reports unreliable movement for test-driven drags while locked.)

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

**Saving and export** (a File menu on the toolbar: New scene, Open…, Save, Export Zdog JS)
- Save (Ctrl+S) downloads a `.zeditor.json` file; Open (Ctrl+O) loads one, as one undo step. Both
  shortcuts replace the browser's own Save page / Open file. After opening a file, Save uses its name.
- A file is untrusted input. Every value is checked; unknown props are dropped and missing ones get
  defaults; colors must be hex, a color name, or rgb()/hsl() (nothing that could load a URL). A file
  from a newer version, or that isn't a scene, is refused with a message and nothing changes.
- The scene autosaves to the browser's localStorage 300 ms after each change, and straight away when
  the page is hidden, so a reload keeps your work (the undo history and the camera are not kept).
  The first visit, with no autosave, opens the 2020 nine-shape scene; "New scene" starts from empty.
- "Export Zdog JS" generates a complete script that runs when pasted into a page that has Zdog: it
  draws into `<canvas class="zeditor-scene">` or adds a 480 × 480 one, with the scene's background and
  the **current camera's** turn and zoom, drag-to-turn, one named `const` per shape (from the shape's
  name, e.g. `roundedRectangle1`, so you can animate it), and a draw loop. It keeps `0`/`false`
  values, applies opacity the same way the editor does, and never includes the gizmo. It is copied to
  the clipboard and downloaded.
- Results and errors appear as a short notice at the bottom of the viewport.

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

### PR 5: Saving and export (`rebuild/5-save-export`)
- Save / Open / autosave, with version checking, in a File menu (New scene moves there too).
- The Zdog JS export.
- Add save and reload to the full Playwright flow.

**Done when:** a reload keeps your work, Save then Open gives the same scene, and a Vitest test runs
the exported script against zdog and gets the same shapes back.

## Animation, cameras and Lottie (after the rebuild)

Agreed in November 2026, after the five rebuild PRs were merged. The user asked for an animation
timeline with keyframes and tweening, cameras, and a Lottie export of the viewport or a camera.

**What was decided**
- **Lottie:** "baked" frames first: each frame is captured exactly as zdog draws it. A "keyframed
  layers" mode comes later, as an export setting.
- **Animatable:** every Inspector value, including position, rotation, scale, opacity, colors, sizes
  and stroke. Fill and Box faces can only hold (jump) between keys.
- **Cameras:** camera objects in the scene. Each has an angle, a target point, a view span and an
  output size (the size is not animatable). The viewport can look through a camera, and exports render
  through a chosen camera. The free editing view stays separate.
- **Easing:** per-key presets: Linear, Ease in, Ease out, Ease in-out and Hold. A key's easing shapes
  the segment leaving it. Custom curves come later.
- **Time:** whole frames. The scene has an fps (default 30) and a length (default 90 frames).
- **Zdog JS export:** it gains animation in a later phase.

**How the Lottie bake works**
- zdog's public `Anchor.renderGraphCanvas(ctx)` draws every shape, back to front, through a few canvas
  calls. `src/render/drawOps.ts` passes it a strict recording "context" (any canvas feature it doesn't
  model throws) and gets each frame as flat 2D paths with their stroke and fill.
- Composite shapes need no special handling. Arcs (dots, the hemisphere dome) become cubic curves.
  The cylinder side's butt caps are recorded as they happen.
- `src/export/lottie/` turns the recording into Lottie:
  - each run of identical frames becomes one shape layer, shown only for those frames (so
    front-to-back order can change from frame to frame);
  - groups are listed top first, as `[paths, fill, stroke, transform]`;
  - color alpha goes into the opacity (players ignore a color's alpha);
  - every layer has `st: 0` (lottie-web never shows a layer without it);
  - coordinates are rounded to 0.01 px;
  - the background is an optional solid layer underneath.
- lottie-web rewrites the data it is given, so the builder never shares one object between two places.
- **Fidelity test:** a browser test renders the same frame with lottie-web's canvas renderer and with
  zdog's own canvas, and compares the pixels (under 1% of drawn pixels may differ, at anti-aliased
  edges). Deliberately breaking layer order, alpha, `st: 0` or round caps/joins makes it fail.

**Phases** (one PR each)
- **A. Lottie export of the current view, still** (`anim/a-lottie-still`):
  - File > Export Lottie…: size (defaults to the viewport's), background on or off, mode (Baked; Keyframed
    shown as coming later), and an estimated file size. Downloads `scene.lottie.json`.
  - Supporting changes:
    - `src/zdog.ts` lets app code be used from Node test scripts too;
    - `cssColor.ts` reads every color a scene can hold, and the file validator now uses it;
    - lottie-web is a test-only dependency.
- **B. Animation core** (file version 2, `anim/b-animation-core`):
  - **Model** (`src/model/`):
    - `animatable.ts` is the one list of animatable properties: position, rotation, scale, opacity and
      every field of the shape type. Each has a kind: number, color, Box face, or hold (Fill).
    - `easing.ts` maps the presets to CSS cubic-bezier curves.
    - `animation.ts`: values at a frame, keys, the keyframe button, and `editAtFrame`, which keys only
      the properties whose value really changes, so a gizmo drag on X never keys Y or Z.
    - `evaluate.ts` poses a scene at a frame, keeping shapes as the same objects when nothing about
      them changes.
  - **Files:** version 2 adds `tracks`, `fps` and `duration`. Version 1 files open with the defaults.
    Every key is checked against its property's rules. An autosave that can't be read back is kept as a
    backup, and you're told once.
  - **Editing:**
    - The Inspector shows values on the playhead's frame.
    - A diamond keyframe button sits beside every field: grey (not animated), outlined (no key here),
      or filled (key here). Position and Rotation each have one button for x, y and z together.
    - Animated fields are tinted yellow on a key and green between keys.
    - Editing an animated value keys it on the current frame; editing any other value changes it for
      the whole animation. The gizmo works the same way.
    - Moving the playhead ends the current undo step. Any edit pauses playback.
  - **Transport bar** under the viewport:
    - Play/Pause and a Frame field;
    - a ruler you click, drag or arrow-key to move the playhead, showing the selected shape's keys;
    - fps and length fields, which are undoable.
    - The playhead isn't saved and isn't part of undo.
  - **Playback:**
    - It never goes through the undo store.
    - Shapes that only moved are updated in place instead of rebuilt.
    - Elements are re-tagged only when new ones appear, and the selection outline is skipped while
      playing.
  - **Exports:** the Lottie export bakes every frame (or only the current one) at the scene's fps.
    The Zdog JS export writes the pose on the current frame.
- **C. Timeline editing** (`anim/c-timeline`):
  - **Timeline panel** under the transport bar (the Timeline button hides or shows it):
    - one row per animated shape (and the selected shape), which you can expand into a row per
      animated property;
    - keys are diamonds, hold keys are squares;
    - the shape's own row shows a summary diamond for each frame with keys.
  - **Selecting keys:** click a key, Shift-click to add or remove one, or drag across empty space to
    select a group. Keys that stop existing (after Undo, say) drop out of the selection.
  - **Moving keys:** drag them left or right, in whole frames. A key that lands on another replaces it.
    The drag works from where the keys started, so moving back and forth never loses a key it passed
    over, and the whole drag is one undo step.
  - **Easing:** the panel's Easing menu or the key's right-click menu; one undo step.
  - **Delete / Backspace** deletes the selected keys when there are any, otherwise the shape. Removing a
    property's last key keeps its value.
  - **Keys:** Space plays and pauses; ←/→ step a frame (Shift: 10); Home/End jump to the first or last
    frame. None of them act inside text fields, and Space and the arrows leave checkboxes and menus alone.
  - **fps** is a choice of common rates. If the scene has keys, changing it asks: keep the timing in
    seconds (keys and length are rescaled and rounded; keys that meet keep the later one), or keep keys
    on their frames. Shortening the length never deletes keys.
  - **Code:** `src/model/keyEdits.ts` holds the pure key edits. The right-click menus share a
    `PopupMenu`.
- **D. Cameras** (`anim/d-cameras`, file version 3):
  - **Free view:** the editor's own view (once called the camera) is now the free view, `FreeView`
    and the `freeView` store, so the scene's cameras can be called cameras.
  - **Camera objects:** Add > Camera makes one that films exactly what the view shows. The scene
    tree lists cameras under Cameras; they can be selected, renamed, duplicated and deleted like
    shapes.
  - **Camera Inspector:**
    - Angle (x/y/z, where z rolls the picture), Target (the point at the middle of the picture) and
      View span (world units across the picture's shorter side), each with keyframe buttons;
    - the picture's Width and Height, which can't be animated;
    - a Look through button.
  - **Look-through mode** (the toolbar's View menu, or the Inspector button):
    - the camera's picture is letterboxed in the viewport, with the rest dimmed;
    - dragging turns the camera, and the wheel changes its view span: one undo step per drag or wheel
      burst, keyed on the current frame when that property is animated;
    - Reset view is off, as it only resets the free view.
  - **In the free view** each camera is drawn as a dashed frame where its picture sits in the world,
    with a notch on its top edge. Clicking it selects the camera.
  - **Views:** `src/render/view.ts` turns the free view or a camera into a `ViewSpec` (rotation
    including roll, target, pixels per unit, size). zdog draws through it with the root anchor's
    `translate = −R·target`, and the gizmo and camera frames use the same projection.
  - **Exports:**
    - the Lottie dialog's View menu films through the free view or a camera; through a camera, each
      frame uses the camera as posed on that frame, at its picture size;
    - the Zdog JS export goes through the current view (when looking through a camera: its angle,
      roll, target, span and picture size).
  - **Files:** version 3 adds `cameras`. Older files open with none. Ids are unique across shapes and
    cameras.
  - **Tests:** Lottie fidelity through a rolled camera off the origin and through an animated camera.
    What look-through shows matches the camera's exported picture, and a camera's frame corners land
    on its letterbox.
- **Later:** the keyframed Lottie mode, animated Zdog JS export, custom easing curves and a graph editor.
- **After D: a UI redesign ("Playroom").** The user asked for the editor to become more fun and
  friendly, drawing on Spotify Wrapped, Leonardo.ai, Recraft and Canva. The research, decisions and
  plan are in [docs/REDESIGN.md](REDESIGN.md), refined with the simmer skill. Built in five PRs: R1
  tokens and type, R2 docked layout, R3 picker, selection toolbar, scene focus and right-click add,
  R4 welcome, export card, first-key tip and toasts, R5 dark theme.

## Groups, and the "Nippu" example

The user asked for Dave DeSandro's Zdog demo of Robin Davey's "Nippu" illustration as an example,
plus a version where the couple walks. The demo is a tree of about 90 shapes, so the editor first
gains groups:
- **G1, groups:** file version 4. Shapes and groups can sit in a group (zdog's Anchor, or its
  Group when "Draw together" is on). Grouping, ungrouping and moving into a group keep things
  where they are in the world. The gizmo works in a group's turned and scaled space. The tree
  nests, and the Inspector has a Group picker.
- **G2:** the zdog options the example needs (a circle's quarters and closed, a shape's closed and
  visible), an importer for zdog scripts (`scripts/import-zdog.mjs`), and File ▾ › Example: Nippu,
  with a Turntable camera. A browser test runs the original script with zdog and compares it with
  the editor's export of the imported scene, from three angles. Big trees start open two levels
  deep.
- **S1, selecting several:** Ctrl-click (Cmd-click) adds to the selection in the tree, the scene
  and camera frames; Shift-click selects a range of tree rows; Ctrl+A selects everything. Group
  puts the whole selection in one group (in the nearest group holding them all, at their middle),
  each keeping its place. Delete, Duplicate and Ungroup act on all of it, and the gizmo's arrows
  move it all as one undo step (turning several together needs a group). The Inspector lists
  what's selected. Asked for by the user after G2: without it, nothing could be grouped by hand.
- **G3, the walking version:** File ▾ › Example: Nippu, walking. `scripts/make-walk.mjs` keys a
  30-frame step cycle (four steps loop with the Turntable): thighs swing in turn and lift as the
  knee bends; knees follow a walk's curve; shoes stand flat, tip up at heel strike and down at
  push-off; arms hang and swing against the legs. The body rides up and down so the lowest point
  of a sole is always on the floor (tests check it on every key, and that there's no limp). The
  lady's straight left leg gets a knee, at her right leg's length. Reviewed frame by frame from
  the side, the front and the demo's angle.

## Animating by hand, and the rest of "Later"

The walk had to be written as a script: the editor could show it but not make it. The user asked
for four more phases, in order, aiming for usability and simplicity ("this editor is fun and not a
chore"). One PR each, branched from main after the previous one merges. Each adds as little UI as
it can, with plain names and a tooltip that says what it does.

- **H1, tools for animating by hand:**
  - **Copy and paste keys.** Ctrl+C copies the keys selected in the timeline (and Copy keys in
    their right-click menu). Ctrl+V pastes them with the first one on the playhead, keeping
    their spacing and easing. Keys copied from one object go onto the selected object if it has
    the same properties (pose the left leg, paste onto the right leg half a step later);
    otherwise back onto the objects they came from. Right-clicking a timeline row offers
    "Paste keys here" at that frame, onto that row. Keys that would land past the end are left
    out, with a notice. One undo step.
  - **Ghosts (onion skin).** A Ghosts button in the transport bar shows faint copies of the
    selected objects (everything, with nothing selected) as posed on the keys before and after
    the playhead: cool for the one before, warm for the one after. Drawn behind the scene, they
    can't be clicked, and they hide while playing.
  - **Move a group's pivot.** A Pivot button in a group's selection toolbar: while it's on, the
    gizmo's arrows move the group's origin (the point it turns and scales about) and its insides
    stay where they are. Their keys move with them. A group that turns or scales over time can't
    move its pivot without changing the animation, so the editor says so and leaves it.
  - **Turning several objects at once.** With several selected, the gizmo has rings too. They turn
    the selection together about its middle, around the world's axes, as one undo step.
- **H2, animated Zdog JS export:** the exported script plays the animation (its keys, easings,
  frame rate and length, looping), with a small player in the file and no other libraries. A
  still scene exports as it does today.
  - It starts on frame 0, whatever frame the editor is on, and steps whole frames at the scene's
    frame rate, as the editor plays. The player works values out the editor's way (the same easing
    curves, colors mixed through RGBA, whole numbers kept whole); a test checks it frame by frame.
  - Moves, turns and scales change the zdog objects in place. A shape whose size, colors or
    opacity change is rebuilt where it was, so the drawing order holds.
  - Through an animated camera, the camera moves too; if it turns, dragging the view is off.
  - `player.pause()`, `player.play()` and `player.goTo(frame)` control it from the page.
- **H3, a keyframed Lottie mode:** a Lottie export option that writes keys instead of every frame,
  for much smaller files. It's offered when it would match the baked picture (it's checked
  against the baked frames), and the dialog says when it can't and why (for example, shapes
  changing their drawing order).
  - Built as "Keys" in the dialog's Mode, the default. It records the frames as baking does,
    follows the nth path drawn from frame to frame, and keys its outline, colors, opacity and
    line width only where a straight line from the key before can't reproduce the frames in
    between (to within a tenth of a pixel). A test checks every frame against the bake.
  - Keys a frame apart hold, so a sudden change (a held color, two faces trading places) happens
    on its frame, never as an in-between.
  - A layer can't change its makeup, so where the paths drawn stop lining up (a cone passing in
    front of a box), a new layer starts, and the dialog says on how many frames. When that's every
    frame (a turntable camera), keys write exactly the baked file, and the dialog says keys can't
    make it smaller.
- **H4, custom easing and a graph editor:** a key's easing can be a curve, edited in a graph view
  of the timeline (a property's value over time, with handles on each key). The named easings
  stay as presets.

## Later

**Lottie export.** Now planned and under way: see "Animation, cameras and Lottie" above.
