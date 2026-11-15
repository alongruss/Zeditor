# Zeditor

A small visual editor for [Zdog](https://zzz.dog) illustrations: place, move, rotate and color
Zdog shapes, save your scene, and export it as a ready-to-run Zdog script.

> **Status:** the rebuild's five phases are done. You can add, select, rename, edit, duplicate and
> delete shapes, move and rotate them with the gizmo, set color alpha and shape opacity, turn and zoom
> the view, undo or redo any change, save and open `.zeditor.json` files (your work is also kept
> between visits), and export a ready-to-run Zdog script or a Lottie file of the current view.
> Animation: key any Inspector value on any frame, with easing, play it back, and edit keys on a
> timeline (move, ease, delete); the Lottie export bakes every frame. Next up: cameras.
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

## License

MIT
