// Web Worker: runs the (CPU-bound) search off the main thread so the UI stays
// responsive. Each request carries an id; the app ignores responses whose id is
// no longer current, which prevents a stale solution from being shown after the
// inputs have changed.
import { solve } from './solver.js';

self.onmessage = (e) => {
  const { id, config } = e.data;
  let result;
  try {
    result = solve(config);
  } catch (err) {
    result = { ok: false, reason: 'Unexpected error: ' + (err?.message ?? String(err)) };
  }
  self.postMessage({ id, result });
};
