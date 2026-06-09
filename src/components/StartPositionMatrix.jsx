import React from 'react';
import { POSITIONS, TARGET_INDEX } from '../solver.js';

// Matrix where each row is a slider and each column is a hole (1..7).
// Exactly one hole per row is the slider's current (start) position.
export default function StartPositionMatrix({ n, start, onChange, disabled = false }) {
  const cols = Array.from({ length: POSITIONS }, (_, i) => i + 1);
  return (
    <div className="matrix-wrap">
      <table className="matrix start-matrix">
        <thead>
          <tr>
            <th className="corner">Slider \ Pos</th>
            {cols.map((c) => (
              <th key={c} className={c - 1 === TARGET_INDEX ? 'target-col' : ''}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, r) => (
            <tr key={r}>
              <th className="row-label">{r + 1}</th>
              {cols.map((c) => {
                const selected = start[r] === c;
                const isTarget = c - 1 === TARGET_INDEX;
                return (
                  <td key={c} className={isTarget ? 'target-col' : ''}>
                    <button
                      type="button"
                      className={'cell-btn' + (selected ? ' selected' : '')}
                      onClick={() => onChange(r, c)}
                      disabled={disabled}
                      aria-label={`Set slider ${r + 1} start position to ${c}`}
                      aria-pressed={selected}
                    >
                      {selected ? '●' : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
