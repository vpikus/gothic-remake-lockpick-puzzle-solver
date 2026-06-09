import React from 'react';
import { LINK } from '../solver.js';

const OPTIONS = [LINK.SAME, LINK.OPPOSITE, LINK.NONE];

// Matrix of links between sliders.
// Row = the slider you actively move. Column = how another slider reacts.
// The diagonal is locked to "Same" (a slider always moves itself).
export default function LinksMatrix({ n, links, onChange, disabled = false }) {
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  return (
    <div className="matrix-wrap">
      <table className="matrix links-matrix">
        <thead>
          <tr>
            <th className="corner">Mover \ Target</th>
            {idx.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, r) => (
            <tr key={r}>
              <th className="row-label">{r + 1}</th>
              {Array.from({ length: n }, (_, c) => (
                <td key={c}>
                  {r === c ? (
                    <span className="locked-same" title="A slider always moves itself">
                      Same
                    </span>
                  ) : (
                    <select
                      className={'link-select link-' + links[r][c].toLowerCase()}
                      value={links[r][c]}
                      onChange={(e) => onChange(r, c, e.target.value)}
                      disabled={disabled}
                      aria-label={`Link from slider ${r + 1} to slider ${c + 1}`}
                    >
                      {OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
