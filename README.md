# Zeditor

A small visual editor for [Zdog](https://zzz.dog) illustrations: place, move, rotate and color
Zdog shapes, save your scene, and export it as a ready-to-run Zdog script.

> **Status:** being rebuilt. You can add, select, rename, edit, duplicate and delete shapes.
> Saving, undo, export and the move/rotate gizmo arrive over the next two PRs.
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
| `npm run check` | Type check, lint and unit tests together |

## How it's built

- [Zdog](https://github.com/metafizzy/zdog) 1.1.3, unmodified, from npm. The editor uses only its public API.
- [Preact](https://preactjs.com) for the side panels; the 3D viewport is plain Zdog on an `<svg>`.
- [Vite](https://vite.dev) and TypeScript.
- GitHub Actions runs every check on each pull request, and deploys `main` to GitHub Pages.

## License

MIT
