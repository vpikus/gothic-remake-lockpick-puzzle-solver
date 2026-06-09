import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, LINK, POSITIONS, TARGET_INDEX } from '../src/solver.js';

// ----------------------------------------------------------------------------
// Independent reference implementation (written separately from solver.js so a
// shared bug is unlikely). State = array of 0..6 indexes. Movement is applied
// PRESS BY PRESS, deliberately NOT using solver.js's monotonic shortcut.
// ----------------------------------------------------------------------------

function buildUnit(n, links) {
  const U = [];
  for (let a = 0; a < n; a++) {
    U[a] = [];
    for (let b = 0; b < n; b++) {
      if (a === b) U[a][b] = 1;
      else if (links[a][b] === LINK.SAME) U[a][b] = 1;
      else if (links[a][b] === LINK.OPPOSITE) U[a][b] = -1;
      else U[a][b] = 0;
    }
  }
  return U;
}

// Apply action (slider a, sign s, k presses) press-by-press. Returns the new
// state, or null if any press would push a slider past an edge.
function applyAction(state, n, U, a, s, k) {
  let cur = state.slice();
  for (let step = 0; step < k; step++) {
    const nxt = cur.slice();
    for (let b = 0; b < n; b++) {
      const nv = cur[b] + s * U[a][b];
      if (nv < 0 || nv > POSITIONS - 1) return null;
      nxt[b] = nv;
    }
    cur = nxt;
  }
  return cur;
}

// Independent minimum number of actions, via plain breadth-first search in
// action-layers (uses a Set+Map of string keys, unlike the typed-array Dijkstra).
function refMinActions(n, startIdx) {
  const target = Array(n).fill(TARGET_INDEX).join(',');
  if (startIdx.join(',') === target) return 0;
  const U = buildUnitFromGlobal(n);
  let frontier = [startIdx];
  const seen = new Set([startIdx.join(',')]);
  let actions = 0;
  while (frontier.length) {
    actions++;
    const next = [];
    for (const st of frontier) {
      for (let a = 0; a < n; a++) {
        for (let s = 1; s >= -1; s -= 2) {
          for (let k = 1; k <= POSITIONS - 1; k++) {
            const ns = applyAction(st, n, U, a, s, k);
            if (!ns) break; // blocked at k -> blocked for all larger k
            const key = ns.join(',');
            if (key === target) return actions;
            if (!seen.has(key)) {
              seen.add(key);
              next.push(ns);
            }
          }
        }
      }
    }
    frontier = next;
    if (actions > 40) return Infinity;
  }
  return Infinity;
}

// Exhaustive lexicographic (actions, presses) optimum within maxDepth actions.
// Used only for small cases (cheap) to also validate the presses tie-breaker.
function bruteBest(n, startIdx, maxDepth) {
  const target = Array(n).fill(TARGET_INDEX).join(',');
  const U = buildUnitFromGlobal(n);
  let best = null;
  const better = (c) =>
    !best || c.actions < best.actions || (c.actions === best.actions && c.presses < best.presses);
  function rec(st, used, presses) {
    if (st.join(',') === target) {
      const c = { actions: used, presses };
      if (better(c)) best = c;
      return;
    }
    if (used >= maxDepth) return;
    for (let a = 0; a < n; a++) {
      for (let s = 1; s >= -1; s -= 2) {
        for (let k = 1; k <= POSITIONS - 1; k++) {
          const ns = applyAction(st, n, U, a, s, k);
          if (!ns) break;
          rec(ns, used + 1, presses + k);
        }
      }
    }
  }
  rec(startIdx.slice(), 0, 0);
  return best;
}

// The current links matrix is passed via a tiny module-level holder so the two
// reference helpers above stay short. Set before each call.
let CURRENT_LINKS = null;
function buildUnitFromGlobal(n) {
  return buildUnit(n, CURRENT_LINKS);
}

// Re-apply the solver's reported steps from the start and confirm they (a) are
// individually legal, (b) match the reported positions, and (c) reach the goal.
function validateSolverSteps(n, start, links, res) {
  const U = buildUnit(n, links);
  let cur = start.map((v) => v - 1);
  let presses = 0;
  for (const step of res.steps) {
    const a = step.slider - 1;
    const s = step.direction === 'Left' ? 1 : -1;
    const ns = applyAction(cur, n, U, a, s, step.count);
    assert.ok(ns, `step on slider ${step.slider} should be legal`);
    assert.deepEqual(
      ns.map((v) => v + 1),
      step.positions,
      'reported positions must match recomputed positions'
    );
    cur = ns;
    presses += step.count;
  }
  assert.deepEqual(cur, Array(n).fill(TARGET_INDEX), 'final state must be all-4');
  assert.equal(res.steps.length, res.totalActions, 'steps length == totalActions');
  assert.equal(presses, res.totalPresses, 'sum of counts == totalPresses');
}

// ---- deterministic PRNG so failures are reproducible ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomConfig(rng, n) {
  const start = Array.from({ length: n }, () => 1 + Math.floor(rng() * POSITIONS));
  const linkVals = [LINK.SAME, LINK.OPPOSITE, LINK.NONE, LINK.NONE]; // bias toward None
  const links = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) =>
      r === c ? LINK.SAME : linkVals[Math.floor(rng() * linkVals.length)]
    )
  );
  return { n, start, links };
}

// ----------------------------------------------------------------------------
// Fixed cases
// ----------------------------------------------------------------------------

test('already solved: all sliders at 4 -> 0 actions', () => {
  const res = solve({ n: 4, start: [4, 4, 4, 4], links: makeIdentity(4) });
  assert.equal(res.ok, true);
  assert.equal(res.solved, true);
  assert.equal(res.totalActions, 0);
  assert.equal(res.steps.length, 0);
});

test('no links: each slider solved independently', () => {
  const res = solve({ n: 4, start: [1, 1, 1, 1], links: makeIdentity(4) });
  assert.equal(res.solved, true);
  assert.equal(res.totalActions, 4); // one action per slider
  assert.equal(res.totalPresses, 12); // 3 presses each (1 -> 4 is Left x3)
  for (const step of res.steps) {
    assert.equal(step.direction, 'Left');
    assert.equal(step.count, 3);
  }
  CURRENT_LINKS = makeIdentity(4);
  validateSolverSteps(4, [1, 1, 1, 1], makeIdentity(4), res);
});

test('linked sliders can be solved with a single action', () => {
  // Slider 1 moves sliders 2,3,4 the same way. All start at 1 -> one Left x3 fixes all four.
  const links = makeIdentity(4);
  links[0][1] = LINK.SAME;
  links[0][2] = LINK.SAME;
  links[0][3] = LINK.SAME;
  const res = solve({ n: 4, start: [1, 1, 1, 1], links });
  assert.equal(res.solved, true);
  assert.equal(res.totalActions, 1);
  assert.equal(res.totalPresses, 3);
  validateSolverSteps(4, [1, 1, 1, 1], links, res);
});

test('opposite link', () => {
  // Slider 1 moves slider 2 the opposite way. start 1: [3,5] -> press slider1 Left x1 -> [4,4].
  const links = makeIdentity(4);
  links[0][1] = LINK.OPPOSITE;
  const res = solve({ n: 4, start: [3, 5, 4, 4], links });
  assert.equal(res.solved, true);
  assert.equal(res.totalActions, 1);
  assert.equal(res.steps[0].slider, 1);
  assert.equal(res.steps[0].direction, 'Left');
  assert.equal(res.steps[0].count, 1);
  validateSolverSteps(4, [3, 5, 4, 4], links, res);
});

// ----------------------------------------------------------------------------
// Randomized cross-validation
// ----------------------------------------------------------------------------

test('randomized: Dijkstra matches independent BFS (min actions) + brute force (presses)', () => {
  const rng = mulberry32(12345);
  let solved = 0;
  let unsolved = 0;
  let bruteChecked = 0;
  const CASES = 400;
  for (let i = 0; i < CASES; i++) {
    const n = 4 + Math.floor(rng() * 3); // 4..6
    const cfg = randomConfig(rng, n);
    CURRENT_LINKS = cfg.links;

    const res = solve(cfg);
    assert.equal(res.ok, true);

    const startIdx = cfg.start.map((v) => v - 1);
    const ref = refMinActions(n, startIdx);

    if (!res.solved) {
      assert.equal(ref, Infinity, `case ${i}: solver says unsolvable but BFS found ${ref}`);
      unsolved++;
      continue;
    }
    solved++;
    assert.equal(
      res.totalActions,
      ref,
      `case ${i}: actions mismatch solver=${res.totalActions} ref=${ref}`
    );
    validateSolverSteps(n, cfg.start, cfg.links, res);

    if (ref <= 3 && ref >= 1) {
      const best = bruteBest(n, startIdx, ref);
      assert.ok(best, `case ${i}: brute force should find a solution`);
      assert.equal(best.actions, res.totalActions, `case ${i}: brute actions`);
      assert.equal(best.presses, res.totalPresses, `case ${i}: brute presses (tie-breaker)`);
      bruteChecked++;
    }
  }
  // Sanity: the random set must exercise both solved and unsolved branches.
  assert.ok(solved > 0, 'expected some solvable cases');
  assert.ok(bruteChecked > 0, 'expected some brute-checked cases');
  console.log(
    `  random: ${solved} solved, ${unsolved} unsolved, ${bruteChecked} brute-verified (of ${CASES})`
  );
});

test('n=7 runs and stays consistent with the BFS reference', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 3; i++) {
    const cfg = randomConfig(rng, 7);
    CURRENT_LINKS = cfg.links;
    const res = solve(cfg);
    assert.equal(res.ok, true);
    const ref = refMinActions(7, cfg.start.map((v) => v - 1));
    if (res.solved) {
      assert.equal(res.totalActions, ref);
      validateSolverSteps(7, cfg.start, cfg.links, res);
    } else {
      assert.equal(ref, Infinity);
    }
  }
});

function makeIdentity(n) {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? LINK.SAME : LINK.NONE))
  );
}
