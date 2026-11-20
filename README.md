# Zeditor

A small visual editor for [Zdog](https://zzz.dog) illustrations: place, move, rotate and color
Zdog shapes, save your scene, and export it as a ready-to-run Zdog script.

> **Status:** the rebuild's five phases are done. You can add, select, rename, edit, duplicate and
> delete shapes, move and rotate them with the gizmo, set color alpha and shape opacity, turn and zoom
> the view, undo or redo any change, save and open `.zeditor.json` files (your work is also kept
> between visits), and export a ready-to-run Zdog script or a Lottie file.
> Animation: key any Inspector value on any frame, with easing, play it back, and edit keys on a
> timeline (move, ease, copy and paste, delete); shape any easing as a curve in the Curves view; Ghosts show the poses on the keys either side; the Zdog
> script plays the animation, looping, with a small player of its own; the Lottie export writes keys (the same picture as baking every frame, usually much smaller) or bakes every frame, and leaves out what's out of view; or export an MP4 video. Cameras: add cameras to the
> scene, look through them, animate them, and export through them. Groups: put shapes in groups
> (nested as deep as you like), which move, turn, scale and animate together; move a group's
> pivot to set where it turns; select several to move or turn them at once. The "Playroom" redesign is done:
> docked panels, a picture Add menu, a selection toolbar, a light and a dark theme
> ([docs/REDESIGN.md](docs/REDESIGN.md)).
> See [docs/PLAN.md](docs/PLAN.md). The 2020 editor is preserved at the
> [`legacy-2020`](https://github.com/alongruss/Zeditor/tree/legacy-2020) tag.

## Run it

Needs Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with live reload |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built site locally |
| `npm run typecheck` | Type-check with TypeScript |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run browser tests (Playwright); run `npx playwright install chromium` once first |
| `npm run test:e2e:slow` | Run the browser tests on a page that acts like a slow machine (4x slower CPU, late frames) |
| `npm run check` | Type check, lint and unit tests together |
| `npm run verify` | Everything: `check`, then the browser tests at normal and slow speed |

Run `npm run verify` before pushing. The slow run catches timing bugs (a test acting before the page has
caught up, or code that runs too late) on your own machine. Without it, they only showed up on GitHub's
slower Linux machines.

## How it's built

- [Zdog](https://github.com/metafizzy/zdog) 1.1.3, unmodified, from npm. The editor uses only its public API.
- [Preact](https://preactjs.com) for the side panels; the 3D viewport is plain Zdog on an `<svg>`.
- [Vite](https://vite.dev) and TypeScript.
- GitHub Actions runs every check on each pull request, and deploys `main` to GitHub Pages.

## Examples

File ▾ › Example: Nippu is Robin Davey's illustration "Nippu", made with Zdog by Dave DeSandro
([CodePen](https://codepen.io/desandro/pen/RerqWW), MIT). Its script is kept unchanged in
`examples-src/nippu.js`; `scripts/import-zdog.mjs` turns it into the scene file
`src/examples/nippu.zeditor.json`. File ▾ › Example: Nippu, walking is the same scene with the
couple walking in place; `scripts/make-walk.mjs` adds the walk.

File ▾ › Example: All the bombs at once is an unofficial fan tribute to
[Kurzgesagt – In a Nutshell](https://www.youtube.com/@kurzgesagt)'s video
["What If We Detonated All Nuclear Bombs at Once?"](https://www.youtube.com/watch?v=JyECrGp-Sw8)
(31 March 2019): four of its scenes (the stockpile of warheads, the button and the fireball, the
mushroom cloud, and the nuclear winter that turns green again), rebuilt from Zdog shapes and
filmed by one camera that cuts between them. The story, the ideas and the look are Kurzgesagt's;
the example isn't made or endorsed by them, and their work isn't covered by this project's MIT
license. `scripts/make-all-the-bombs.mjs` makes `src/examples/all-the-bombs.zeditor.json`.

## License

MIT
