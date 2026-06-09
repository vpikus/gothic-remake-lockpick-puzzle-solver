import React, { useState, useRef, useEffect } from 'react';
import { solve, validateConfig, MIN_SLIDERS, MAX_SLIDERS, LINK } from './solver.js';
import { encodeConfig, decodeConfig } from './configCodec.js';
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

const STORAGE_KEY = 'gothic-lock-solver.config.v1';

// Keep the link matrix diagonal pinned to "Same" after loading external data.
function normalizeLinks(links) {
  return links.map((row, r) => row.map((v, c) => (c === r ? LINK.SAME : v)));
}

// Read a previously saved config from localStorage. Returns null if absent or invalid.
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const cfg = { n: data.n, start: data.start, links: data.links };
    if (validateConfig(cfg)) return null; // invalid -> ignore the stored value
    cfg.links = normalizeLinks(cfg.links);
    return cfg;
  } catch {
    return null;
  }
}

function getInitialConfig() {
  return loadConfig() || { n: MIN_SLIDERS, start: makeStart(MIN_SLIDERS), links: makeLinks(MIN_SLIDERS) };
}

export default function App() {
  // Restore the last saved config (computed once) so a page refresh keeps the inputs.
  const initialRef = useRef(null);
  if (initialRef.current === null) initialRef.current = getInitialConfig();
  const init = initialRef.current;

  const [n, setN] = useState(init.n);
  const [start, setStart] = useState(init.start);
  const [links, setLinks] = useState(init.links);
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  // Persist the config on every change so it survives a page refresh.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ n, start, links }));
    } catch {
      // storage unavailable (private mode / quota) — ignore
    }
  }, [n, start, links]);

  // Close the "More" menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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

  // Copy the current config as a compact Base64 string (handy for sharing / debugging).
  const copyConfig = async () => {
    const text = encodeConfig({ n, start, links });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. non-secure context) — show the string to copy manually.
      window.prompt('Copy this config string:', text);
    }
  };

  // Load a config from a pasted Base64 string (the counterpart of Copy config).
  const importConfig = () => {
    const input = window.prompt('Paste a config string:');
    if (input == null) return; // cancelled
    const text = input.trim();
    if (!text) return;

    let cfg;
    try {
      cfg = decodeConfig(text);
    } catch {
      window.alert('Invalid config: could not decode the string.');
      return;
    }

    const err = validateConfig(cfg);
    if (err) {
      window.alert('Invalid config: ' + err);
      return;
    }

    setN(cfg.n);
    setStart(cfg.start);
    setLinks(normalizeLinks(cfg.links));
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

        <div className="more-menu" ref={menuRef}>
          <button
            className="secondary more-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            More ▾
          </button>
          {menuOpen && (
            <div className="more-dropdown" role="menu">
              <button
                role="menuitem"
                onClick={copyConfig}
                title="Copy the current configuration as a Base64 string"
              >
                {copied ? 'Copied!' : 'Copy config'}
              </button>
              <button
                role="menuitem"
                disabled={solving}
                onClick={() => {
                  setMenuOpen(false);
                  importConfig();
                }}
                title="Load a configuration from a Base64 string"
              >
                Import config
              </button>
            </div>
          )}
        </div>
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
