import React from 'react';
import { TARGET_INDEX } from '../solver.js';

const TARGET = TARGET_INDEX + 1; // 4

// Renders the solver result: a summary plus a step-by-step table.
// The first table row is always the initial state.
export default function SolutionTable({ n, result }) {
  if (!result) return null;
  if (!result.ok) return <div className="result error">{result.reason}</div>;
  if (!result.solved) return <div className="result error">{result.reason}</div>;

  const sliders = Array.from({ length: n }, (_, i) => i + 1);

  const rows = [{ label: 'Initial', action: '—', positions: result.initial }];
  result.steps.forEach((s, i) => {
    rows.push({
      label: String(i + 1),
      action: (
        <>
          Slider {s.slider} —{' '}
          <span className={'dir dir-' + s.direction.toLowerCase()}>{s.direction}</span> ×{s.count}
        </>
      ),
      positions: s.positions,
    });
  });

  return (
    <div className="result success">
      <div className="summary">
        {result.totalActions === 0
          ? 'Already solved — every slider is already at position 4.'
          : `Solved in ${result.totalActions} action${
              result.totalActions === 1 ? '' : 's'
            } (${result.totalPresses} total press${result.totalPresses === 1 ? '' : 'es'}).`}
      </div>

      <table className="matrix solution-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Action</th>
            {sliders.map((s) => (
              <th key={s}>S{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i === 0 ? 'initial-row' : ''}>
              <td>{row.label}</td>
              <td className="action-cell">{row.action}</td>
              {row.positions.map((p, j) => (
                <td key={j} className={'pos-cell' + (p === TARGET ? ' at-target' : '')}>
                  {p}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
