# Hybrid Athletics

Phone-first multi-sport training tracker. Personal side project (not a school project).
Live: https://tsheehan11.github.io/hybrid-athletics/ (GitHub Pages, served from `main`).
README.md is the full reference for the algorithms, storage format and roadmap. Read the relevant
section before changing the engine or learning code.

## Layout

- `app.js`: the whole app in one IIFE (~2,500 lines). Vanilla JS, no build step, no dependencies.
- `styles.css`, `index.html` (only loads the other two).
- Keep JS in `app.js` and CSS in `styles.css`, never inline in `index.html`. The repo should show as
  JavaScript on GitHub.

## How the code works

- HTML is built as strings; `render()` redraws the view. Events are delegated through
  `data-act` / `data-ch` / `data-in` attributes. Do not add per-element listeners or a framework.
- State: `S.program` (profile, templates, week plan, settings) and `S.months` (logs).
- Derived caches `HC`, `SC`, `LC`, `HB` must be cleared whenever state changes. A new mutation that
  skips this shows stale suggestions.
- The same code also runs inlined in a Claude artifact, where storage is the artifact's per-user
  database. On Pages or locally it uses `localStorage`. Any storage change has to work on both paths
  (`initStore`, `persist`, `localLoad`).

## Do not break saved data

- `localStorage` key is `cali-climb-log-v1`. Never rename it.
- Documents: `program`, and one `m-YYYY-MM` per month shaped `{ days: { "YYYY-MM-DD": entry } }`.
- Backup format is `{ app: "hybrid-athletics", v: 1, program, months }`. Old backups must still restore.
- Changing the exercise library means bumping `LIB_V` and handling the upgrade in `libUpdate`.
- Any change to the shape of `program` goes through `normalizeProgram` so old data still loads.

## Safety rules stay hard-coded

The finger-training gate, rest after hard sports, beginner volume caps, and the clamps on learned
multipliers are never loosened or made learnable. Learning may reorder safe options only.

## Checking a change

There is no test suite yet. Before saying a change is done:

1. `node --check app.js`
2. Load `index.html` (a local static server, or jsdom) and confirm: no console errors, the setup
   wizard completes, Today renders, a workout can be logged and survives a reload.
3. For engine or learning changes, write a throwaway jsdom script that exercises the changed
   function with a few logged days, and report its output. Do not commit the script unless asked.

Say plainly if a check could not be run. Do not claim it works untested.

## Git

- Branch, then open a PR into `main`. Do not push to `main` directly; it is the live site.
- Commits are authored as the repo owner, using the git identity already configured. No Claude co-author
  or attribution lines.
- Commit messages: one plain sentence saying what changed, like the existing history.
- Update README.md in the same PR when behaviour, storage or algorithms change.

## Current priority

Moving from the Claude artifact to a real standalone web app (README, "Roadmap", Phase 1:
TypeScript + Vite modules, pure-function engine with unit tests, PWA with IndexedDB, Postgres
backend, import from the v1 backup format). Bug fixes come first, migration second. Do not start
the migration or add dependencies or a build step unless the task says to.
