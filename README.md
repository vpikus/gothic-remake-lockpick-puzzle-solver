# Gothic Remake — Lock Puzzle Solver

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-2ea44f?logo=github)](https://vpikus.github.io/gothic-remake-lockpick-puzzle-solver/)

A single-page React app that finds the **simplest** solution to the Gothic Remake
"sliders" lock puzzle: the sequence of moves that brings every slider to **position 4**
using the fewest **actions** (changes of the active slider), then the fewest total presses.

## The puzzle

- There are **N sliders** (`N = 4..7`). Each slider sits in one of **7 holes** (positions `1..7`).
  The goal is **position 4** for every slider.
- **Direction:** `Left` shifts a slider toward position 7, `Right` toward position 1.
  From position 4: `Left → 5`, `Right → 3`. At position 1 you can't go Right; at 7 you can't go Left.
- **Links:** moving one slider can move others. In the link matrix the **row** is the slider you
  actively move and the **column** is how another slider reacts:
  - `Same` — it moves the same Left/Right direction as the active slider,
  - `Opposite` — it moves the other way,
  - `None` — it is not affected.
  The diagonal is locked to `Same` (a slider always moves itself).
- **Blocking (all-or-nothing):** each "press" moves the active slider and all its linked sliders one
  step together. If **any** of them (active or linked) would be pushed past position 1 or 7, the press
  is impossible — a slider stuck at an edge can block the whole move.
- An **action** = pressing the same slider in the same direction `k ≥ 1` times in a row.

## What "optimal" means

Among all solutions, the best one has the **fewest actions** (fewest changes of the active slider).
Ties are broken by the **fewest total presses**. This is exactly what the solver returns.

## Algorithm

The full state is a vector of slider positions (`{0..6}^N`). The solver runs **Dijkstra** over this
state graph, where each edge is one action (active slider + direction + a run of `k` presses) and the
cost is the lexicographic pair `(actions, presses)`. State vectors are encoded as base-7 integers and
stored in typed arrays, so even the largest case (`7^7 = 823 543` states) is solved in well under a
second. See [`src/solver.js`](src/solver.js).

## Run it

```bash
npm install
npm run dev      # start the dev server (Vite prints a localhost URL)
```

Other scripts:

```bash
npm run build    # production build into dist/
npm run preview  # preview the production build
npm test         # run the solver verification tests
```

## Tests

[`test/solver.test.mjs`](test/solver.test.mjs) verifies the solver with an **independent**
implementation: it cross-checks the Dijkstra result against a separate breadth-first search
(minimum number of actions) and a brute-force search (the presses tie-breaker) over hundreds of random
configurations, and re-applies every reported solution step-by-step to confirm it actually reaches the
goal. Run with `npm test`.

## Deployment (GitHub Pages)

Pushing to `main` builds the app and publishes it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

One-time setup: in the GitHub repo, open **Settings → Pages** and set **Source** to
**GitHub Actions**. After the next push, the site is served at
`https://<user>.github.io/gothic-remake-lockpick-puzzle-solver/`.

The workflow sets `VITE_BASE` to the repository path so assets (and the Web Worker) resolve
under the Pages sub-path. If you rename the repository, update `VITE_BASE` in the workflow to match.

## How to use

1. Choose the **number of sliders** (4–7).
2. In **Start positions**, click the current hole of each slider (one per row). Column 4 is the goal.
3. In **Links**, set how each slider (row) moves the others (columns).
4. Press **Find Solution**. The result table lists each action and the position of every slider after
   it; the first row is the initial state.
