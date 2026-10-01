# Paper Sudoku

A quiet, paper-inspired Sudoku application for 9×9 and 16×16 puzzles. The application runs entirely in the browser: no account, API keys, backend, analytics, or external runtime dependencies.

## Features

- Classic 9×9 and Super 16×16, each with Beginner, Easy, Medium, Hard, and Expert puzzles.
- Daily puzzles, an earlier-date archive, and a progressive journey for each board size.
- Pencil notes, undo/redo, optional conflict highlighting, and explained logical hints.
- A journal for saved and finished pages, with completion statistics, times, and daily streaks.
- Light, dark, and automatic themes; timer, motion, sound, ambience, and haptic settings.
- Local progress saving, portable backup export/import, and installable offline play.

## Puzzle generation

The local puzzle bank contains 40 templates: four for each size and difficulty combination. Every template has a unique solution and is verified with human solving techniques. New puzzles use deterministic, Sudoku-preserving transformations of these templates: symbol substitutions, row and column permutations within bands and stacks, band and stack permutations, and transposition. The generator checks the resulting human-technique rating before returning a puzzle, with a verified template fallback. Difficulty labels describe the techniques needed to solve a puzzle; they are not assigned from the number of blank squares.

Daily puzzles use the `daily-v1` seed recipe so the same date and board size reproduce the same page. **Developer rule:** keep the v1 puzzle bank and its generation, rating, and date-to-difficulty rules immutable to preserve daily archives. Introduce a new version for future puzzle banks or generation changes, and retain the v1 resolver for existing archive dates. Do not replace the current bank by rerunning `scripts/generate-bank.mjs` as a routine build step.

## Run locally

Use Node.js 22 or 24 (CI uses 24).

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173`. The development server serves source files. It does not install the offline worker; a production build is required to test offline behavior.

```sh
npm test
npm run build
npm run preview
```

The preview serves `dist` at the same address. Close the development server first, or pass a separate port: `npm run preview -- --port 4174`. The generated `build-manifest.json` records all offline files and their SHA-256 digests. Builds are deterministic for the same source inputs.

## Import into Vercel

Import the repository and set its root directory to this application folder if it is inside a larger repository. `vercel.json` configures Framework Preset **Other**, install command `npm ci`, build command `npm run build`, and output directory `dist`. Select Node.js 22 or 24. No environment variables are required. This repository includes build/test CI only; it does not deploy or require a Vercel token.

The app uses root-relative URLs and is intended to run at the root of a domain. A deployment under a URL subdirectory needs coordinated changes to the asset URLs, manifest, and service worker scope.

## Offline and installation

Visit the built app once online over HTTPS (or localhost) and allow its offline cache to finish. All app modules, puzzle-bank data, fonts, icons, and the paper image are precached together. Afterwards the cached app can load and play offline. Installation availability and menu wording depend on the browser; use its Install/Add to Home Screen command when available.

Each build gets a content-versioned cache. An update waits until all tabs using the previous version are closed; it never forces an active puzzle to reload. Close the app's tabs and reopen to use an available update. Browser storage eviction or clearing site data removes offline files and local saves.

## Saves and backups

Progress and preferences stay in local browser storage on the device and browser where you play. They do not sync across devices or deployment domains. Use the app's backup export/import controls to retain a portable copy before clearing browser data or changing domains. Private browsing and blocked storage can prevent durable saves. Keep an exported backup somewhere you can find again.

## Audio and assets

Pencil, eraser, tap, completion, and feedback sounds are original Web Audio synthesis. Rain and library room tone are synthesized locally; no audio recordings are fetched. Sound effects and ambience have separate volume controls. Audio requires a user interaction to unlock, and it suspends while the page is hidden. Browser autoplay restrictions may require another interaction after returning to the app.

The paper texture is an original generated image compressed into WebP without changing its visual content. App icons are original SVG-derived PNGs. Lora and Nunito Sans are self-hosted variable fonts from the Google Fonts repository, distributed under the SIL Open Font License; their licenses are included in `public/assets/fonts/`. No Google Fonts request occurs at runtime.

## Project layout

- `index.html`, `src/`: application source.
- `public/`: local assets, web manifest, and service-worker registration.
- `scripts/build.mjs`: zero-dependency static build and offline cache generation.
- `scripts/dev.mjs`: local development/preview HTTP server.
- `tests/`: Node.js functional tests.

The service worker caches only same-origin build files. It does not cache user backups or send local game state to a server.
