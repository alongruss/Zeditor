# Zeditor UI redesign: design brief

**Status:** decisions settled (section 6). Nothing here is built yet; R1 comes next.

**Goal:** make Zeditor feel fun and friendly, borrowing the good parts of Spotify Wrapped,
Leonardo.ai, Recraft and Canva. This brief turns that research into a direction, a migration plan
tied to the code, and the questions to settle before building.

## 1. Who it's for and what "fun and friendly" means

Zeditor makes small, round, colorful 3D illustrations with Zdog, animates them and exports Lottie.
Its users are illustrators, motion designers and tinkerers more than CAD users, and Zdog's own look
is flat color, round strokes and playful shapes. "Fun and friendly" here means the work is the
hero, the next step is obvious, the UI has a voice, and finishing is rewarded, while it stays a
precise tool: scrubbable numbers and shortcuts stay, and nothing gets slower or harder to read.

## 2. What we take from each product

### Spotify Wrapped: color, type as form, celebration

Does well:

- Flat, high-contrast color fields with big type on top (2024).
- Type as form: oversized numerals cloned, gradient-filled and patterned.
- "Goldilocks variety": two or three related looks per theme, consistent but not identical.
- Layered motion where each shape moves on its own but in harmony (2022, with Hornet).
- A big palette with a system: 48 shape-and-color combinations on a 16×16 grid, one family.
- A cheeky, celebratory tone that makes your own data the star.

**We take:** the **export card** (big numbers on a sticker-colored card, a looping preview);
a **sticker palette** of 8 saturated category colors, always paired with a label or icon; **one
display face**, used rarely and large; short warm **copy**. **We leave:** the story format,
statistics screens, and the cheeky tone (decision 1: calm and friendly). An editor is not a recap.

### Leonardo.ai: a dark stage that makes art glow

Does well:

- A dark-by-default interface that frames colorful work.
- Pill buttons: solid white primary, outlined secondary.
- Wide, heavy, all-caps display type, bent into 3D perspective on its homepage.
- Work shown on floating, rounded cards.

**We take:** a first-class **dark theme**, **pill buttons**, and **rounded floating pills** for
the few things that sit on the scene (panels themselves are docked: see Layout).
**We avoid:** reviewers call its canvas editor a clunky "Photoshop Lite"; we keep panels few and
contextual.

### Recraft: a calm canvas, context by selection

Does well:

- An infinite canvas with a tiny toolbar; holding Space gives the hand tool.
- Zoom presets (50/100/200%, fit to project, fit to selection) in one place.
- Panels follow the selection: none, one object (Modify, Reuse, Finalize), or several (batch, align).
- Right-click on empty canvas starts with "Create new" at that spot.
- Brand: black, electric violet, and one lime-yellow call-to-action pill.

**We take:** **selection-driven context** (a floating toolbar by the selection, kept clear of the
gizmo, which Recraft's 2D canvas lacks); **fit-to-scene and fit-to-selection**; **right-click to
add a shape there**; and the **single loud accent** for the one main action. Recraft's loud color is
lime; ours is violet (Recraft's other brand color), because lime on white is 1.28:1 and would need
a border to read as a button. Lime survives as a sticker color only.

### Canva: light, airy, floating, contextual

Canva's editor "glow up" was, in Fast Company's words, its "biggest redesign in 13 years". Does well:

- A lighter editor: the left sidebar lost its black background.
- Floating panels and toolbars, so users' "content shine" (Canva's stated aim).
- A floating context toolbar with only the actions that apply, plus a ⋯ menu for the rest.
- Editing panels open on the right; the left side is for adding.
- A question as headline ("What will you design today?"), colored icon tiles, 16–24px radii.

**We take:** the **layout model** (add on the left, edit on the right, act by the selection),
though docked rather than floating (see Layout); **colored icon tiles** in the Add menu; the **question
headline** for the empty scene; **generous radii** and soft shadows. **We avoid:** reviewers found
some features harder to find after they moved. Every existing control keeps its accessible name,
and moved controls gain a second path rather than losing the old one (Export stays in File ▾).

## 3. Where Zeditor is today

Seen at 1400×860 and read from the code:

- **Gray, docked chrome.** `src/App.tsx` lays out a `320px | 1fr | 320px` grid (`--panel-width`);
  the `<aside>`s "Scene tree" and "Inspector" (`--panel-bg: #f0f0f0`) take 46% of the width. The
  middle `<main>` stacks viewport, transport (48px) and timeline (176px, open by default:
  `panelOpen: true` in `src/state/timeline.ts`).
- **Small type.** Ubuntu from Google Fonts (`index.html`); 18 rules at 11–12px, one 9px, one 10px;
  headings 14px.
- **One blue accent** (`--accent: #2f5fd0`) does focus, buttons, the selected key, camera frames and
  `.selection-outline`. Keys are hard-coded amber `#e8a500`/`#c98a00`; animated fields are tinted
  `#fff3c4`/`#e6f4e8`.
- **Toolbar.** `src/panels/Toolbar.tsx` sits inside `Viewport.tsx` over the scene: File ▾, Add ▾,
  View, Duplicate, Delete, Undo, Redo, Reset view, all one weight. It owns the Export Lottie dialog.
- **Text-only Add menu, a long gray Inspector, one-sentence empty states** (`SceneTree.tsx:46`,
  `Inspector.tsx:27`), and one always-mounted notice region (`NoticeBar.tsx`: `status`, or `alert`
  for the `error` kind).
- **Overlays.** The gizmo has a white halo, `.selection-outline` none. `Viewport.tsx` sizes
  everything from `container.clientWidth/clientHeight`.
- **Keep:** scrub labels, keyframe diamonds, undo for everything, full keyboard support, and the
  accessible names the `e2e/*.ts` tests rely on (section 5).

## 4. Direction: "Playroom"

A light, airy editor: slim panels docked flush to the window edges give the scene as much room as
possible, small rounded pills float only over the scene itself, sticker colors mark what things
are, and one violet accent marks the main action. Dark theme is
one switch away.

### Principles

1. **Stage first.** Panels are docked flush to the window edges, with no outer margins or gaps
   between them, and the scene fills everything in between. Only small pills (context toolbar, zoom,
   toasts, export card) float over the scene.
2. **Add on the left, edit on the right, act by the selection.**
3. **Each color has one job.** Violet: primary action and focus. Coral: selection. Amber: keys.
   Stickers: categories, always with a label or icon.
4. **Big type and pictures for moments** (empty stage, export card, Add menu); working UI is 13px.
5. **Acknowledge finishing, calmly.** The voice is calm and friendly: warm, plain words, no jokes
   and no confetti. Nothing moves for show during playback or drags; motion is 150–200ms and off
   under `prefers-reduced-motion`.
6. **Nothing gets lost.** Every control keeps an equal-or-shorter path and its accessible name.

### Where delight lives, and where precision is protected

| Delight (friendly, never noisy) | Calm precision (never animated, never decorated) |
|---|---|
| Empty stage, export card, first-key tip | Inspector fields, scrub labels, the gizmo (nothing covers a handle) |
| Add picker tiles (spin on hover only) | Timeline lanes, keys, the playhead |
| Notice toasts (sticker color by kind) | The scene during playback and drags |
| Sticker dots in the Scene list | Numbers: tabular figures, values never animate |

### Design tokens

R1 keeps every existing variable name in `src/styles.css` and changes values, so the ~1000 lines
using them need no renaming. All ratios use the WCAG 2 formula.

**Color, light theme**

| Token | Today | New | Notes |
|---|---|---|---|
| `--panel-bg` | `#f0f0f0` | `#ffffff` | panels |
| `--page-bg` (new) | — | `#f4f1ec` | warm paper |
| `--group-bg` | `#f8f8f8` | `#f7f5f2` | sections |
| `--hover-bg` | `#e8eefc` | `#efe9ff` | |
| `--text` ("ink") | `#222222` | `#1d1b22` | 17.04:1 on white |
| `--text-muted` | `#666666` | `#615d6b` | 6.39:1 white, 5.87:1 `#f7f5f2`, 5.41:1 hover |
| `--border` | `#c8c8c8` | `#e3dfe8` | dividers only (decorative) |
| `--border-field` (new) | — | `#8a8496` | field edges: 3.61:1 white, 3.31:1 `#f7f5f2` |
| `--accent` | `#2f5fd0` | `#6c3cf4` | violet; white text 5.85:1 |
| `--accent-pressed` (new) | — | `#5527d6` | white text 7.93:1 |
| `--select` (new) | — | `#ff5a36` | coral selection outline |
| `--key` / `--key-edge` (new) | hard-coded `#e8a500` / `#c98a00` | `#e8a500` / `#a87300` | edge 4.10:1 white, 3.77:1 `#f7f5f2` |
| `--anim-key-bg` / `--anim-tween-bg` (new) | hard-coded `#fff3c4` / `#e6f4e8` | same | ink 15.31:1 / 14.99:1 |
| `--danger` (new) | hard-coded `#b42318` | same | 6.57:1 white, 6.04:1 `#f7f5f2` |
| `--radius` | `4px` | `10px` | inputs; menus 12px; panels square |
| `--shadow` | `0 4px 8px rgb(0 0 0 / 20%)` | `0 8px 24px rgb(29 27 34 / 12%)` | plus 1px `--border` |

- **Field borders.** Today's `#c8c8c8` is 1.67:1 on white, below WCAG 1.4.11's 3:1.
- **Keys** stay amber (the Blender convention the code cites); the edge goes from 2.95:1 to
  4.10:1. The selected key turns violet with a `--accent-pressed` edge.
- **One primary color.** Violet fills exactly two buttons: Export ▾ in the Inspector header and
  Export in the Export Lottie dialog (never visible together; the dialog is modal). Everything else
  is an outlined or ghost pill. Focus is a 2px violet outline at 2px offset (today's rules already
  use `outline: 2px solid var(--accent)`): 5.85:1 on white, 5.19:1 on `#f4f1ec`, 4.95:1 on hover.
- **Selection** is coral, so it never reads as a button. Coral is 2.41:1 on the default peach scene
  background (`#ffddbb`), and white on peach is 1.29:1, so instead of contrast with the scene the
  line gets a guaranteed white neighbor (coral on white 3.10:1): a 1px halo on both sides
  (`box-shadow: 0 0 0 1px rgb(255 255 255 / 90%), inset 0 0 0 1px rgb(255 255 255 / 90%)`), like
  the gizmo's. The outline is already hidden during playback.
- **Stickers:** tomato `#ff6b4a`, tangerine `#ffa630`, sunflower `#ffd23f`, lime `#9be15d`, mint
  `#2ec4b6`, sky `#3fa7ff`, grape `#9b6ff8`, bubblegum `#ff6fb5`. Never the only signal. When a
  sticker is a fill behind text (toasts, the export card), the text is always ink `#1d1b22`, in both
  themes, never white: ink is 11.80:1 on sunflower, 8.72:1 on tangerine, 6.05:1 on tomato, 10.81:1 on
  lime, 4.89:1 on grape (white would be 1.44, 1.95, 2.82, 1.58 and 3.49). Grape is `#9b6ff8`
  rather than the more common `#8b5cf6`, on which ink is only 4.03:1.
- **Unchanged:** gizmo axis colors and summary-key grays.

**Color, dark theme**

- Panels `#1c1a22`, page `#121016`, raised `#2a2731` (lighter, not shadowed).
- Text `#ece9f1` (14.34:1 on panels), muted `#a8a3b3` (7.01:1 panels, 5.97:1 raised), field borders
  `#7a7484` (3.82:1).
- Accent `#9b7bff` (5.47:1 on panels, 6.00:1 page); the light `#6c3cf4` would be 2.94:1. White on
  `#9b7bff` is only 3.15:1, so primary buttons use ink `#1d1b22` (5.41:1).
- Keys: amber 8.04:1 on panels; edge 3.57:1 on raised.
- Must change: `--anim-key-bg` `#3d3214`, `--anim-tween-bg` `#1f3527` (text 10.51 / 10.95:1; the
  light tints give 1.08 / 1.06); `--danger` `#ff8a7a` (7.51:1 panels, 6.40:1 raised; light: 2.62).
- Unchanged: stickers and their ink text, coral selection, the stage ring. The scene background
  (`scene.settings.background`, inline on `.viewport`) is artwork, never themed.

**Type**

- **UI: Figtree**, friendly geometric. 13px body, 12px labels, 11px uppercase captions (0.04em);
  nothing below 11px. Weights 500/600/700 for labels/headings/buttons. `tabular-nums` in fields
  and the transport.
- **Display: Bricolage Grotesque**, variable width and weight, 28–64px at 800, −0.03em: the
  Wrapped/Leonardo "type as form", for moments only.
- Both open source, bundled via Fontsource (`@fontsource-variable/*`), Latin subset,
  `font-display: swap`; no runtime request to Google.

**Shape, space, motion**

- Radii: docked panels are square, flush to the window, separated by 1px `--border` lines; menus
  and popovers 12px; inputs 10px; buttons, chips and floating pills are pills; picker tiles 10px;
  selection outline stays 4px.
- 4px grid: 8px inside controls, 12px between fields, 12px panel padding; floating pills sit 12px
  in from the scene's edges. Hit targets ≥28px (WCAG 2.2 asks 24px); panel-header buttons 32px.
- 150ms hovers and presses; 200ms `cubic-bezier(0.2, 0.8, 0.2, 1)` for cards and menus, the export
  card included. No springs or overshoot.

### Layout

Revised after the first mockups (decision 8): floating cards cost too much room in margins and
gaps, so panels are docked.

```
┌───────────────┬──────────────────────────────────────────────┬─────────────────┐
│(Z) File▾  ↶ ↷ │                                              │ Free view▾ Export▾│ ← panel headers
│───────────────│        ╭────────────────────────╮            │─────────────────│
│ [ + Add ▾ ]   │        │ Duplicate Delete ◇ ⋯   │ context    │ Cone 1    Cone  │
│ SHAPES        │        ╰────────────────────────╯ toolbar    │ ▾ Transform     │
│ ● Box 1       │              ↑ cone + gizmo below            │ ▾ Size          │
│ ● Cone 1   ◂  │          THE SCENE (between panels)          │ ▸ Appearance    │
│ CAMERAS       │                          [– 100% + Fit Reset] │                 │ ← zoom pill
│ ◫ Camera 1    ├──────────────────────────────────────────────┤                 │
│               │ ▶ 0:01.00 Frame 30 of 90  30 fps  Timeline▾  │                 │ ← dock, 148px
│               │ ruler · Cone 1 · Position · Rotation Y …     │                 │
└───────────────┴──────────────────────────────────────────────┴─────────────────┘
```

- **Grid.** `.app` keeps today's three columns, narrower: `232px | minmax(0, 1fr) | 288px` (today
  `320px | 1fr | 320px`). The middle column is the viewport above the dock. No outer margins or
  gaps; panels are white, separated from the scene by 1px `--border` lines.
- **No top bar.** The Scene panel header holds logo, File ▾ (unchanged), Undo, Redo; the Inspector
  header holds View and the violet Export ▾, a second path to File's two export items.
- **Scene panel** (232px): a 40px Add button (the shape picker), then Shapes and Cameras rows with
  sticker dots. Collapses to a 56px rail, automatically below 1200px.
- **Inspector panel** (288px): today's fields in collapsible sections; with nothing selected, its
  header and "Select a shape or camera to edit it."
- **Dock** (148px): a 34px transport row, an 18px ruler and 20px lanes; about four lanes show
  before it scrolls. Open by default as today.
- **Floating pills over the scene:** the zoom cluster at the scene's bottom right (zoom out, %,
  zoom in, Fit selection, Reset view), toasts at its top right, the export card at its bottom
  center, and the context toolbar (piece 2).
- **Scene size.** At 1280×720 the scene is 760×572 (today 640×496, so about 37% more area; the
  floating-card draft had 712×472). The SVG is sized to the viewport as today, so no "safe area"
  plumbing is needed: fit zoom, Reset view, the camera letterbox and the gizmo already use the
  viewport's size.

### Signature pieces

1. **Shape picker (Add menu).** A three-across grid of sticker tiles, each shape drawn by zdog,
   with its name; cameras in a second group. Tiles render once to static SVG when the menu first
   opens; only the hovered tile turns (one loop, stopped on leave, off under reduced motion). Arrow
   keys, Home/End, Enter/Space, each calling `preventDefault()` so the window shortcuts in `App.tsx`
   (step frame, first/last frame, play) don't also fire. Tile names sit below the tile, on the
   menu's white, not on the sticker fill. Still a `menu` named "Add" with today's `menuitem` names.
   Compact: 264px wide, three across, 44px-tall tiles with 11px names, opening beside the Add
   button and layered above the dock, so the timeline never covers it.
2. **Context toolbar** (Canva/Recraft act-by-the-selection, made safe for precise work): a 40px
   pill, role `toolbar` "Selection actions", with Duplicate, Delete, ◇ "Key transform", ⋯ "More".
   - **Keep-out box.** Gizmo handles are fixed-size around the projected center: arrows to
     `ARROW_LENGTH_PX` 84, rings of `RING_RADIUS_PX` 58 (`gizmoMath.ts:20,22`), 14px `.gizmo-hit`
     strokes (`styles.css:129`). So the pill avoids the union of the outline's bounds and the
     center ± 95px (84 + `ARROW_HEAD_PX` 11, covering the 7px hit overhang and the rings' 65px
     reach). The center is `project(shape.translate, view)`, as at `Gizmo.tsx:83`. `ARROW_HEAD_PX`
     moves from `Gizmo.tsx:24` into `gizmoMath.ts` beside a new `GIZMO_REACH_PX` = 95.
   - **Placement.** Centered on the gizmo, 8px above the keep-out box; else below; else (outline
     larger than the stage) the same tries against the gizmo square alone. Clamped inside the
     viewport minus a 44px bottom strip for the zoom cluster. One try always fits: square plus
     pill and gap both sides is 190 + 2 × 48 = 286px; the clamp area is at least 452 − 44 = 408px
     (900×600, `smoke.spec.ts`'s smallest: 600 minus the 148px dock). Cameras have no gizmo: their frame is the keep-out box,
     and while looking through one the pill pins top center.
   - **Drag.** New `src/state/pointerDrag.ts` (a `createStore(false)`), set by `Gizmo.tsx`
     `startDrag`/`endDrag` and by `Viewport.tsx` when `press.orbiting` turns true (line 146) until
     `onPointerUp`/`onPointerCancel`. While true: `opacity: 0; pointer-events: none`, not `hidden`,
     so focus survives.
   - **Keyboard.** Rendered in `.viewport` after the Gizmo: tab order Scene panel → toolbar → zoom
     cluster → dock → Inspector. One Tab stop, roving Left/Right/Home/End with `preventDefault()`,
     which the global playhead shortcuts respect (`App.tsx`, `if (event.defaultPrevented) return`).
     After Delete, focus goes to the row that took its place, else the previous row, else "Add ▾".
     After Duplicate, focus stays on Duplicate (the component isn't keyed by selection). Escape
     moves focus to `svg.scene` (piece 3); the global shortcut then clears the selection.
   - **Playback.** `hidden` while `timeline.playing` (the outline is hidden too and
     `SceneView.ts:188` skips measuring); focus inside moves to `svg.scene` first. Delete/Backspace,
     Ctrl+D and the right-click "Shape actions" menu (`ContextMenu.tsx`, `menuitem`s, so no name
     clash) still work.
   - "Look through" stays only in the Inspector: a second button with that name would break the
     page-wide lookups at cameras.spec.ts:119, :168 and lottie.spec.ts:273.
3. **Stage focus ring.** `svg.scene` (name "Scene", `tabindex="-1"`: focusable by script, not by
   Tab) receives focus after Escape in the toolbar and when playback hides it. An inset box-shadow
   on `.viewport` would paint under the SVG, so the ring is an overlay on the viewport:

   ```css
   svg.scene:focus-visible { outline: none; }
   .viewport:has(svg.scene:focus-visible)::after {
     content: ''; position: absolute; inset: 0; pointer-events: none;
     box-shadow: inset 0 0 0 2px #fff, inset 0 0 0 4px #1d1b22;  /* white 0–2px, ink 2–4px */
   }
   ```

   - **Geometry.** Two adjacent, non-overlapping 2px bands, each bordered by the scene background
     on one side; 17.04:1 against each other. They tie at background luminance 0.204, so on any
     scene color at least one band reaches 4.13:1. On the default peach the ink band is 13.24:1.
   - **Visibility.** Nothing covers the viewport's edge now that panels are docked beside it, and
     the zoom pill, toasts and export card sit 12px in. Colors are fixed, not themed: the scene
     color is the user's.
   - Under `forced-colors: active` box-shadows are dropped, so the rule adds
     `outline: 2px solid CanvasText; outline-offset: -2px` there. `:has()` ships in Chromium 105+,
     Firefox 121+, Safari 15.4+. Static, so no playback cost.
4. **Empty stage.** "What will you make today?" in display type, with tiles "Add a shape", "Open a
   file", "Start from the sample scene" (undoable). `pointer-events: none` except the buttons, so
   drag and right-click still work. The Scene panel keeps today's sentence.
5. **Export card.** The dialog closes as today; a non-modal sunflower card, "Export done",
   slides up at the scene's bottom center: the animation looping (zdog frames, not
   lottie-web), "90 frames · 3.0 s · 48 KB" in the display face (ink, 11.80:1), and Done. It takes
   no focus and is not a live region (the existing "Saved scene.lottie.json" notice announces
   once); Done, Escape or the next edit closes it. No confetti or jokes (decision 1). Reduced
   motion: a still frame instead of the loop.
6. **First key.** The dock opens if closed, and the notice says
   "Move to another frame and change something to animate it". Once per browser (`localStorage` in
   try/catch; if blocked, the tip just reappears).
7. **Toasts.** `NoticeBar` stays the one always-mounted region, restyled as a toast at the
   scene's top right. `info`: sunflower `#ffd23f`, ink text 11.80:1, an "i" icon. `error`: tomato
   `#ff6b4a`, ink 6.05:1, a "!" icon, role `alert` as today. Both themes. Dismiss's focus ring
   here is ink, not violet (violet on tomato is 2.08:1).

### Accessibility and performance guards

- **Contrast test.** R1 adds `src/styles.contrast.test.ts` (Vitest), which reads `src/styles.css`
  and fails if text drops below 4.5:1 or a field edge, key edge or focus ring below 3:1. Pairs
  include the field tints, `--danger`, ink on each sticker fill, the toast focus ring, and the stage
  ring's bands on `#ffddbb` and at the 4.13:1 worst case. R5 adds dark pairs.
- **Keyboard and landmarks.** DOM order stays Scene panel, `<main>` (stage, dock), Inspector: the
  visual order and today's tab order. Both `<aside>`s keep their headings and stay mounted. Collapse
  buttons use `aria-expanded`; Escape closes any menu and returns focus to its opener.
- **Reduced motion.** CSS `@media (prefers-reduced-motion: reduce)` sets durations to 0.01ms; JS
  motion (tile spin, preview loop) checks one helper in `src/state/motion.ts`. An e2e test with
  `page.emulateMedia({ reducedMotion: 'reduce' })` exports and checks the preview is still and the
  hovered picker tile doesn't turn.
- **Playback speed.** No `backdrop-filter`, and no new `filter` on `svg.scene` or anything redrawn
  per frame; panels and pills are opaque. The toolbar adds one `project()` call to bounds `SceneView.ts`
  already measures, and both stop while playing (`SceneView.ts:111`). Check: `timeline.spec.ts`
  "Play moves the shape, and Pause stops on the frame it reached" in the `chromium` and `slow`
  projects, plus a 5-second Chrome profile of the starter scene playing at 1280×720 before and
  after R1, R2 and R4. Budget: ≤1ms added to average frame time, numbers in the PR.
- **Sizes.** No phone or tablet layout, as today. Works from 1024px (Scene panel as rail);
  `smoke.spec.ts` keeps its 900×600 step and the scene must fit the viewport there.

## 5. Migration plan (one PR each)

Each PR ships before/after screenshots, runs `npm run check`, `npm run test:e2e` and
`npm run test:e2e:slow` locally, and waits for green CI.

Strings the tests rely on:

| String or role (where used) | Plan |
|---|---|
| button "Add ▾" (cameras.spec.ts:19, :147; editing.spec.ts:137; gizmo.spec.ts:23; lottie.spec.ts:267) | **Keep.** `Dropdown.tsx` renders `{label} ▾`; the "+" icon is `aria-hidden`. |
| button "File ▾" (helpers.ts:86, lottie.spec.ts:302); "Export Zdog JS", "Export Lottie…" | **Keep.** Export ▾ is an extra path. |
| "No shapes yet. Use Add to create one." (editing.spec.ts:210, files.spec.ts:101) | **Keep**; stage copy differs, so `getByText` stays unambiguous. |
| "Select a shape or camera to edit it." (editing.spec.ts:163); `complementary` "Inspector" (helpers.ts:68) | **Keep**; the Inspector stays mounted. |
| "Undo", "Redo", "Reset view", combobox "View", region "Timeline", "Look through", "Back to free view" | **Keep, one of each.** |
| buttons "Duplicate", "Delete" (cameras.spec.ts:69, :109, page-wide) | **Keep, one of each**: R3 moves them and removes the header copies in the same PR (strict mode). |
| `status` / `alert` (files.spec.ts:54, 64, 75, 79, 110; lottie.spec.ts:263, 309 expects an empty `status`) | **Keep** the single `NoticeBar` region. |
| dialog "Export Lottie" hidden after export (lottie.spec.ts:261) | **Keep**; the export card is separate. |

### R1: Tokens and type (no layout change)

- `src/styles.css`: new values; hard-coded key colors, `#1d3f99`, field tints and `#b42318` become
  tokens; `--border-field` on inputs and selects (the `border: 1px solid var(--border)` rules near
  lines 586 and 940); timeline `#fafafa` → `var(--panel-bg)`; 9px and 10px rules → 11px;
  `tabular-nums`; the `.selection-outline` halo, radius kept at 4px.
- `index.html`: drop the preconnects and Ubuntu link. `src/main.tsx`: import
  `@fontsource-variable/figtree` (added to `package.json`).
- New `src/styles.contrast.test.ts`. No e2e string changes.
- **Watch for:** Figtree is wider than Ubuntu; check `--tl-label-width: 176px` still fits
  "Position X" and the toolbar (`flex-wrap: wrap`) doesn't wrap at 1280px. Label-drag tests
  (editing.spec.ts:104, :122; undo.spec.ts:15) measure the label's box, so they adapt.

### R2: Docked layout

- `src/App.tsx`: same `<aside>` Scene, `<main>` (Viewport, then `.dock` with TransportBar and
  TimelineArea), `<aside>` Inspector, in the same order with the same headings and ids.
- `src/styles.css`: grid `232px | minmax(0, 1fr) | 288px`; panels flush with 1px borders; dock
  148px; zoom cluster, toasts and export card as floating pills inside `.viewport`.
- `src/panels/Toolbar.tsx` split and moved out of `Viewport.tsx`: File, Undo, Redo to the Scene
  header; Add to the top of the Scene panel; View, Export ▾, Duplicate, Delete to the Inspector
  header for now; Reset view to the zoom cluster. `lottieOpen` moves to new `src/state/dialogs.ts`
  so File ▾ and Export ▾ open one dialog.
- Panels are siblings of `.viewport`, so wheel and pointer events over them no longer zoom or orbit
  (today wheeling over the toolbar zooms).
- **E2E:** the viewport keeps owning its own size, so `emptyPoint`, `orbit()`, the smoke test's
  "scene inside its column" check, and the camera and Lottie default-size tests
  (cameras.spec.ts:48–50, lottie.spec.ts:238–240) stay as they are. The zoom pill now covers the
  viewport's bottom-right corner, which `emptyPoint` (bottom-left) never uses.
- **Must pass unchanged:** files.spec.ts:130, gizmo.spec.ts:59, editing.spec.ts:166; their helpers
  assert the target is topmost, so a panel or pill over Cone 1 or a handle fails loudly.

### R3: Shape picker, context toolbar, stage focus, right-click add

- `src/panels/Dropdown.tsx`: optional `icon` (aria-hidden), a `grid` layout, roving arrow/Home/End
  focus (today only Escape), with `preventDefault()` and a test that arrows in the open picker
  leave the Frame field unchanged. New `src/panels/ShapeTiles.ts` renders each type's SVG once.
- New `src/viewport/ContextToolbar.tsx` and `src/state/pointerDrag.ts` as in piece 2, with outline
  bounds from `SceneView.ts` `placeSelectionOutline` (lines 186–217, via a callback). Duplicate and
  Delete leave the Inspector header. `svg.scene` gets `tabindex="-1"` and the piece 3 CSS.
- `Viewport.tsx` `onContextMenu`: right-click on empty space (today: browser menu) opens "Add here",
  via a new `unproject()` in `gizmoMath.ts` and `addShapeOfType(type, at?)` in
  `src/state/commands.ts`.
- **Tests:**
  - cameras.spec.ts:69 and :109 now hit the toolbar's buttons; gizmo.spec.ts:79, :109 join R2's
    must-pass list (`grabbable()`, helpers.ts:129, needs handles topmost).
  - New gizmo.spec.ts "the context toolbar never covers a gizmo handle": Cone 1 and Box 1, front,
    after `orbit(page, 80, -50)`, and at 900×600; every `arrow()` point (from, tip, 10 between) and
    `ring()` point lies outside the toolbar box grown by 7px.
  - New keyboard tests: Delete focuses the next Shapes row, or "Add ▾" when empty; Duplicate keeps
    focus; Left/Right in the toolbar don't move the playhead; the toolbar hides while playing and
    Ctrl+D still duplicates.
  - New stage-focus test: select Cone 1, Tab into the toolbar, press Escape. Then
    `document.activeElement` is `svg.scene`; the viewport's `::after` box-shadow holds both bands;
    and `document.elementFromPoint` at the viewport's four corners, each 3px inside, returns an
    element inside `.viewport`, not a panel, the zoom pill or a toast.
  - New: right-click adds a shape there; picker grid keyboard; `unproject` round-trips `project`; a
    pure `toolbarPlacement()` never meets the gizmo square for clamp areas down to 408px.
- **Watch for:** cameras.spec.ts:62 clicks Camera 1's frame label with Cone 1 selected; if the pill
  covers it, add frame labels to the keep-out box.

### R4: Delight

- Empty-stage overlay in `Viewport.tsx`; new `src/panels/ExportDone.tsx`, opened by
  `ExportLottieDialog.tsx`; the first-key tip via the notice store; `NoticeBar` as toast; new
  `src/state/motion.ts` and reduced-motion rules; `@fontsource-variable/bricolage-grotesque` (first
  use of the display face).
- **Unchanged:** editing.spec.ts:210, files.spec.ts:101, lottie.spec.ts:261–262; "films through a
  camera…" reopens File ▾ right after an export, which works because the card is non-modal.
- **New:** empty-stage buttons, export card and its reduced-motion variant, first-key tip once.
  New names checked for collisions: "Open a file", "Add a shape", "Done", "Export done".

### R5: Dark theme

- `src/styles.css`: dark values under `:root[data-theme='dark']` and under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }`.
- File menu theme choice ("Match system", "Light", "Dark"), stored in `localStorage` in try/catch,
  applied to `<html data-theme>`.
- **Tests:** dark pairs in `styles.contrast.test.ts`; one smoke test with
  `page.emulateMedia({ colorScheme: 'dark' })` checks dark panels and an untouched scene background.
  No string changes.

## 6. Decisions (settled 2026-11-15, layout revised the same day)

1. **Tone:** calm and friendly. Warm, plain copy; the export card shows the numbers and the preview,
   with no confetti or jokes; the first-key tip is a plain notice.
2. **Theme:** light first; the dark theme (following the system setting) comes in R5.
3. **Fonts:** Figtree for the UI, Bricolage Grotesque for display moments, both bundled.
4. **Color roles:** violet `#6c3cf4` is the one primary-action and focus color; coral marks
   selection; keys stay amber; lime is only a sticker color.
5. **Inspector with no selection:** stays mounted with its header and one line, so the stage never
   shifts and editing.spec.ts:163 and helpers.ts:68 stay as they are.
6. **Top controls:** in the panel headers (scene 572px tall at 1280×720), not a separate top
   bar.
7. **New cameras and Lottie exports** default to the visible scene. With docked panels that is
   simply the viewport, as today, so no test changes.
8. **Docked panels** (revised after seeing the mockups): no floating cards, outer margins or gaps;
   the timeline dock is 148px; the Add picker is compact and opens above the dock. This drops the
   former safe-area step, so the plan is now five PRs (R1 to R5).

## Sources

- Spotify Wrapped: Active Theory, [2018 technical case study](https://medium.com/active-theory/spotify-wrapped-2018-technical-case-study-5b7cfb7e9d3a);
  It's Nice That, [2022 identity](https://www.itsnicethat.com/features/spotify-wrapped-campaign-identity-2022-graphic-design-301122);
  Alex Jimenez, [Three design elements that made Wrapped 2024 great](https://alexjimenezdesign.substack.com/p/three-design-elements-that-made-spotify);
  Rive, [Spotify used Rive for Wrapped 2025](https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025);
  Blake Crosley, [Spotify design guide](https://blakecrosley.com/guides/design/spotify) (unofficial).
- Leonardo.ai: TechRadar, [review](https://techradar.com/pro/software-services/leonardoai-ai-image-generator-review);
  Leonardo help, [Live Canvas](https://intercom.help/leonardo-ai/en/articles/8658301-livecanvas).
- Recraft: docs, [Canvas](https://www.recraft.ai/docs/recraft-studio/work-area/canvas);
  SaaS UI, [Recraft editor pattern](https://www.saasui.design/pattern/editor/recraft).
- Canva: Newsroom, [The Canva glow up](https://www.canva.com/newsroom/news/glow-up/);
  Brenda Cadman, [Canva's glow up: a tour](https://brendacadman.com/canvas-glow-up-a-tour/);
  Fast Company, [Canva unveils its biggest redesign in 13 years](https://www.fastcompany.com/91313361/canva-unveils-its-biggest-redesign-in-13-years).
- Public homepages of recraft.ai, leonardo.ai and canva.com, viewed November 2026. Their editors
  need an account, so editor details come from docs and reviews.
