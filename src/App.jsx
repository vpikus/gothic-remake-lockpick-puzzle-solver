import React, { useState, useRef, useEffect } from 'react';
import { solve, MIN_SLIDERS, MAX_SLIDERS, LINK } from './solver.js';
import StartPositionMatrix from './components/StartPositionMatrix.jsx';
import LinksMatrix from './components/LinksMatrix.jsx';
import SolutionTable from './components/SolutionTable.jsx';

const DEFAULT_START = 1; // every new slider starts at hole 1 until the user changes it

function makeStart(n, prev = []) {
  return Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_START);
}

function makeLinks(n, prev = []) {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? LINK.SAME : prev[r]?.[c] ?? LINK.NONE))
  );
}

export default function App() {
  const [n, setN] = useState(MIN_SLIDERS);
  const [start, setStart] = useState(() => makeStart(MIN_SLIDERS));
  const [links, setLinks] = useState(() => makeLinks(MIN_SLIDERS));
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);

  // The search runs in a Web Worker. Every request gets a monotonically increasing
  // id; responses whose id is no longer current are ignored, so a result can never
  // overwrite the view after the inputs have changed.
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let worker = null;
    try {
      worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, result: res } = e.data;
        if (id !== requestIdRef.current) return; // stale response
        setResult(res);
        setSolving(false);
      };
      workerRef.current = worker;
    } catch {
      workerRef.current = null; // environments without Workers fall back to a sync solve
    }
    return () => {
      if (worker) worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Any input change invalidates an in-flight request and the currently shown solution.
  const invalidate = () => {
    requestIdRef.current += 1;
    setResult(null);
    setSolving(false);
  };

  const changeN = (val) => {
    const next = Math.max(MIN_SLIDERS, Math.min(MAX_SLIDERS, val));
    if (next === n) return;
    setN(next);
    setStart((prev) => makeStart(next, prev));
    setLinks((prev) => makeLinks(next, prev));
    invalidate();
  };

  const setStartCell = (row, col) => {
    setStart((prev) => prev.map((v, i) => (i === row ? col : v)));
    invalidate();
  };

  const setLinkCell = (row, col, value) => {
    setLinks((prev) =>
      prev.map((r, ri) => r.map((v, ci) => (ri === row && ci === col ? value : v)))
    );
    invalidate();
  };

  const findSolution = () => {
    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    setResult(null);
    setSolving(true);

    const config = { n, start, links };
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ id, config });
      return;
    }
    // Fallback (no Worker): defer so the spinner paints, then solve synchronously.
    setTimeout(() => {
      if (id !== requestIdRef.current) return;
      let res;
      try {
        res = solve(config);
      } catch (err) {
        res = { ok: false, reason: 'Unexpected error: ' + (err?.message ?? String(err)) };
      }
      if (id !== requestIdRef.current) return;
      setResult(res);
      setSolving(false);
    }, 20);
  };

  const resetAll = () => {
    setStart(makeStart(n));
    setLinks(makeLinks(n));
    invalidate();
  };

  return (
    <div className="app">
      <header>
        <h1>Gothic Remake — Lock Puzzle Solver</h1>
        <p className="subtitle">
          Find the simplest sequence of moves that brings every slider to position 4.
        </p>
      </header>

      <section className="card">
        <h2>1. Number of sliders</h2>
        <div className="n-control">
          <button
            onClick={() => changeN(n - 1)}
            disabled={n <= MIN_SLIDERS || solving}
            aria-label="Fewer sliders"
          >
            −
          </button>
          <span className="n-value">{n}</span>
          <button
            onClick={() => changeN(n + 1)}
            disabled={n >= MAX_SLIDERS || solving}
            aria-label="More sliders"
          >
            +
          </button>
          <span className="hint">
            ({MIN_SLIDERS}–{MAX_SLIDERS})
          </span>
        </div>
      </section>

      <section className="card">
        <h2>2. Start positions</h2>
        <p className="hint">
          Click the current hole of each slider. Each row is one slider; column 4 (highlighted) is the
          goal.
        </p>
        <StartPositionMatrix n={n} start={start} onChange={setStartCell} disabled={solving} />
      </section>

      <section className="card">
        <h2>3. Links</h2>
        <p className="hint">
          The <b>row</b> is the slider you move; the <b>column</b> is how another slider reacts.{' '}
          <b>Same</b> = it moves the same way, <b>Opposite</b> = it moves the other way, <b>None</b> = it
          is unaffected. The diagonal is locked to <b>Same</b> (a slider always moves itself).
        </p>
        <LinksMatrix n={n} links={links} onChange={setLinkCell} disabled={solving} />
      </section>

      <section className="card actions-card">
        <button className="primary" onClick={findSolution} disabled={solving}>
          {solving ? 'Solving…' : 'Find Solution'}
        </button>
        <button className="secondary" onClick={resetAll} disabled={solving}>
          Reset
        </button>
      </section>

      <section className="card" aria-live="polite" aria-busy={solving}>
        <h2>Solution</h2>
        {solving ? (
          <div className="result" role="status">
            Searching for the optimal solution…
          </div>
        ) : result ? (
          <SolutionTable n={n} result={result} />
        ) : (
          <div className="placeholder">Fill in the data above and press “Find Solution”.</div>
        )}
      </section>

      <footer>
        <p className="hint">
          <b>How movement works:</b> <b>Left</b> shifts a slider toward position 7, <b>Right</b> toward
          position 1 (from position 4, Left → 5 and Right → 3). Each press moves the active slider and all
          its linked sliders one step together; if any of them sits at an edge (1 or 7) and would be pushed
          past it, the move is blocked. <b>Optimal</b> = the fewest actions (changes of the active slider),
          then the fewest total presses.
        </p>
      </footer>
    </div>
  );
}
