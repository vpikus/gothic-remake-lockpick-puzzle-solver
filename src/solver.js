// Gothic Remake — lock (sliders) puzzle solver.
//
// Model
// -----
// * N sliders (4..7). Each slider sits in one of 7 holes, position 1..7
//   (stored internally as index 0..6). The goal is position 4 (index 3) for ALL sliders.
// * Direction convention (as defined by the puzzle):
//     LEFT  shifts a slider's active hole toward 7 (index + 1).
//     RIGHT shifts it toward 1 (index - 1).
//   From position 4: Left -> 5, Right -> 3.
// * Each "press" moves the active slider one step in the chosen direction AND moves every
//   linked slider one step too:
//       Same     -> the linked slider moves the same L/R direction as the active one
//       Opposite -> it moves the other direction
//       None     -> it is not affected
//   (The diagonal of the link matrix is always "Same": a slider always moves itself.)
// * A press is ALL-OR-NOTHING: if the active slider OR any linked slider would be pushed past
//   position 1 or 7, the whole press is impossible (blocked). A slider stuck at an edge can
//   therefore block the active slider.
// * An "action" = pressing the SAME slider in the SAME direction k >= 1 times in a row.
//
// Optimality
// ----------
// The most optimal solution has the FEWEST actions (number of times the active slider changes),
// with ties broken by the FEWEST total presses. This is solved exactly with Dijkstra over the
// full state space (a position vector in {0..6}^N), using the lexicographic cost (actions, presses).

export const POSITIONS = 7; // holes per slider
export const TARGET_INDEX = 3; // position 4 (1-based) -> index 3 (0-based)
export const MIN_SLIDERS = 4;
export const MAX_SLIDERS = 7;
export const LINK = { SAME: 'Same', OPPOSITE: 'Opposite', NONE: 'None' };

const INF = 0x7fffffff;

// Per-press index delta of slider b when slider a is pressed "Left" (sign = +1).
// Value in {-1, 0, +1}. For a different sign s, the real delta is s * U[a][b].
function buildUnit(n, links) {
  const U = [];
  for (let a = 0; a < n; a++) {
    U[a] = new Int8Array(n);
    for (let b = 0; b < n; b++) {
      if (a === b) U[a][b] = 1; // a slider always moves itself
      else if (links[a][b] === LINK.SAME) U[a][b] = 1;
      else if (links[a][b] === LINK.OPPOSITE) U[a][b] = -1;
      else U[a][b] = 0; // None
    }
  }
  return U;
}

function encode(p, n) {
  let code = 0;
  for (let b = n - 1; b >= 0; b--) code = code * POSITIONS + p[b];
  return code;
}

function decode(code, n) {
  const p = new Array(n);
  for (let b = 0; b < n; b++) {
    p[b] = code % POSITIONS;
    code = Math.floor(code / POSITIONS);
  }
  return p;
}

// Min-heap keyed lexicographically by (actions, presses). Items: [actions, presses, code].
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this._less(a[i], a[par])) {
        const t = a[i];
        a[i] = a[par];
        a[par] = t;
        i = par;
      } else break;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && this._less(a[l], a[s])) s = l;
        if (r < n && this._less(a[r], a[s])) s = r;
        if (s === i) break;
        const t = a[i];
        a[i] = a[s];
        a[s] = t;
        i = s;
      }
    }
    return top;
  }
  _less(x, y) {
    return x[0] !== y[0] ? x[0] < y[0] : x[1] < y[1];
  }
}

/**
 * Validate a puzzle configuration. Returns null if valid, otherwise a reason string.
 */
export function validateConfig({ n, start, links }) {
  if (!Number.isInteger(n) || n < MIN_SLIDERS || n > MAX_SLIDERS)
    return `Number of sliders must be ${MIN_SLIDERS}..${MAX_SLIDERS}.`;
  if (!Array.isArray(start) || start.length !== n) return 'Start positions are incomplete.';
  for (let i = 0; i < n; i++)
    if (!Number.isInteger(start[i]) || start[i] < 1 || start[i] > POSITIONS)
      return `Start position of slider ${i + 1} must be between 1 and 7.`;
  if (!Array.isArray(links) || links.length !== n) return 'Link matrix is incomplete.';
  for (let a = 0; a < n; a++) {
    if (!Array.isArray(links[a]) || links[a].length !== n) return 'Link matrix is incomplete.';
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      if (![LINK.SAME, LINK.OPPOSITE, LINK.NONE].includes(links[a][b]))
        return `Invalid link value at (${a + 1}, ${b + 1}).`;
    }
  }
  return null;
}

/**
 * Solve the puzzle.
 *
 * @param {{n:number, start:number[], links:string[][]}} config
 *   start[i]  -> current hole of slider i, 1..7
 *   links[a][b] -> 'Same' | 'Opposite' | 'None' (links[a][a] ignored, treated as Same)
 * @returns {object} result:
 *   { ok:false, reason }                                   -> invalid input
 *   { ok:true, solved:false, reason, initial }             -> no solution exists
 *   { ok:true, solved:true, initial, steps, totalActions, totalPresses }
 *     steps[i] = { slider, direction:'Left'|'Right', count, positions:number[] }
 *     positions = positions (1..7) of every slider AFTER applying that action.
 */
export function solve({ n, start, links }) {
  const invalid = validateConfig({ n, start, links });
  if (invalid) return { ok: false, reason: invalid };

  const startIdx = start.map((v) => v - 1);
  const target = new Array(n).fill(TARGET_INDEX);
  const startCode = encode(startIdx, n);
  const targetCode = encode(target, n);

  const U = buildUnit(n, links);
  const total = POSITIONS ** n;

  const distA = new Int32Array(total).fill(INF);
  const distP = new Int32Array(total).fill(INF);
  const parent = new Int32Array(total).fill(-1);
  const actAgent = new Int16Array(total).fill(-1);
  const actSign = new Int8Array(total); // +1 = Left, -1 = Right
  const actCount = new Int8Array(total);

  distA[startCode] = 0;
  distP[startCode] = 0;

  const heap = new Heap();
  heap.push([0, 0, startCode]);

  while (heap.size) {
    const [ca, cp, code] = heap.pop();
    if (ca !== distA[code] || cp !== distP[code]) continue; // stale heap entry
    if (code === targetCode) break;
    const p = decode(code, n);

    for (let a = 0; a < n; a++) {
      const Ua = U[a];
      for (let s = 1; s >= -1; s -= 2) {
        // Largest number of presses that keeps EVERY slider within [0, 6].
        // Movement is monotonic per press, so only the final position can violate the bound.
        let maxK = POSITIONS - 1;
        for (let b = 0; b < n; b++) {
          const d = s * Ua[b];
          if (d > 0) {
            const room = POSITIONS - 1 - p[b];
            if (room < maxK) maxK = room;
          } else if (d < 0) {
            if (p[b] < maxK) maxK = p[b];
          }
        }
        if (maxK <= 0) continue; // blocked: cannot even press once
        const na = ca + 1;
        for (let k = 1; k <= maxK; k++) {
          let ncode = 0;
          for (let b = n - 1; b >= 0; b--) ncode = ncode * POSITIONS + (p[b] + s * Ua[b] * k);
          const np = cp + k;
          if (na < distA[ncode] || (na === distA[ncode] && np < distP[ncode])) {
            distA[ncode] = na;
            distP[ncode] = np;
            parent[ncode] = code;
            actAgent[ncode] = a;
            actSign[ncode] = s;
            actCount[ncode] = k;
            heap.push([na, np, ncode]);
          }
        }
      }
    }
  }

  if (distA[targetCode] === INF)
    return {
      ok: true,
      solved: false,
      reason: 'No solution exists for this configuration — the goal cannot be reached.',
      initial: start.slice(),
    };

  // Reconstruct the path of actions from start to target.
  const chain = [];
  let cur = targetCode;
  while (cur !== startCode) {
    chain.push(cur);
    cur = parent[cur];
  }
  chain.reverse();

  const steps = chain.map((codeStep) => {
    const agent = actAgent[codeStep];
    const sign = actSign[codeStep];
    return {
      slider: agent + 1, // 1-based slider number
      direction: sign === 1 ? 'Left' : 'Right',
      count: actCount[codeStep],
      positions: decode(codeStep, n).map((v) => v + 1), // 1..7 after this action
    };
  });

  return {
    ok: true,
    solved: true,
    initial: start.slice(),
    steps,
    totalActions: distA[targetCode],
    totalPresses: distP[targetCode],
  };
}
