"use client";

import { PREVIEW_MAX_QUBITS } from "@/lib/composer/circuit";
import {
  DEFAULT_VIEW,
  formatPhase,
  phaseColor,
  project,
  qsphereStates,
  statevectorRows,
  type View,
} from "@/lib/composer/qsphere";
import type { Statevector } from "@/lib/composer/statevector";
import { useMemo, useRef, useState } from "react";
import { MdRefresh } from "react-icons/md";

type StateView = "qsphere" | "statevector";

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 120;
const MAX_DOT = 14;
const MIN_DOT = 2.5;
const RING_STEPS = 72;

// The circuit's final state from the in-browser simulation, as a Q-sphere
// (like IBM Quantum Composer's) or a table of amplitudes. Updates with every
// edit, like the probabilities chart.
export default function StatePanel({ state }: { /** Null above PREVIEW_MAX_QUBITS. */ state: Statevector | null }) {
  const [view, setView] = useState<StateView>("qsphere");
  return (
    <section className="flex min-w-0 flex-col default-radius border border-gray-50 bg-gray-50 p-4" aria-label="State">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <select
          className="default-radius cursor-pointer border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-700"
          value={view}
          onChange={(e) => setView(e.target.value as StateView)}
          aria-label="View"
        >
          <option value="qsphere">Q-sphere</option>
          <option value="statevector">Statevector</option>
        </select>
      </div>
      {!state ? (
        <p className="py-10 text-center text-sm text-gray-500" data-state-limit>
          Available up to {PREVIEW_MAX_QUBITS} qubits
        </p>
      ) : view === "qsphere" ? (
        <QSphere state={state} />
      ) : (
        <AmplitudeTable state={state} />
      )}
    </section>
  );
}

function QSphere({ state }: { state: Statevector }) {
  const dots = useMemo(() => qsphereStates(state), [state]);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [showState, setShowState] = useState(true);
  const [showPhase, setShowPhase] = useState(false);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  const toScreen = (p: { x: number; y: number; z: number }) => {
    const q = project(p, view);
    return { x: CENTER + q.sx * RADIUS, y: CENTER - q.sy * RADIUS, depth: q.depth };
  };

  // Latitude rings for every Hamming weight, plus the equator; the far half is fainter.
  const n = state.numQubits;
  const ringPaths = useMemo(() => {
    const latitudes = new Set<number>([Math.PI / 2]);
    for (let k = 1; k < n; k++) latitudes.add((Math.PI * k) / n);
    let front = "";
    let back = "";
    for (const theta of latitudes) {
      for (let s = 0; s < RING_STEPS; s++) {
        const at = (i: number) => {
          const phi = (2 * Math.PI * i) / RING_STEPS;
          const q = project({ x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) }, view);
          return { x: CENTER + q.sx * RADIUS, y: CENTER - q.sy * RADIUS, depth: q.depth };
        };
        const a = at(s);
        const b = at(s + 1);
        const seg = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        if (a.depth + b.depth >= 0) front += seg;
        else back += seg;
      }
    }
    return { front, back };
  }, [n, view]);

  const north = toScreen({ x: 0, y: 0, z: 1 });
  const south = toScreen({ x: 0, y: 0, z: -1 });
  const placed = dots.map((d) => ({ d, ...toScreen(d) })).sort((a, b) => a.depth - b.depth);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto block w-full max-w-[22rem] cursor-grab touch-none select-none active:cursor-grabbing"
          role="img"
          aria-label="Q-sphere"
          data-qsphere
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, view };
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start) return;
            const limit = Math.PI / 2;
            setView({
              yaw: start.view.yaw + (e.clientX - start.x) * 0.01,
              pitch: Math.max(-limit, Math.min(limit, start.view.pitch + (e.clientY - start.y) * 0.01)),
            });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="white" stroke="#d1d5db" />
          <path d={ringPaths.back} stroke="#e5e7eb" strokeDasharray="2 3" fill="none" />
          <path d={ringPaths.front} stroke="#d1d5db" fill="none" />
          <line x1={north.x} y1={north.y} x2={south.x} y2={south.y} stroke="#e5e7eb" />
          {placed.map(({ d, x, y, depth }) => {
            const color = phaseColor(d.phase);
            const r = Math.max(MIN_DOT, MAX_DOT * Math.sqrt(d.probability));
            const fade = depth < -0.05 ? 0.45 : 1;
            // Labels sit just outside the dot, away from the centre.
            const dx = x - CENTER;
            const dy = y - CENTER;
            const len = Math.hypot(dx, dy) || 1;
            const lx = x + (dx / len) * (r + 4) + (len < 1 ? r + 4 : 0);
            const ly = y + (dy / len) * (r + 4);
            const anchor = dx > 4 ? "start" : dx < -4 ? "end" : "middle";
            const labels = [showState ? `|${d.label}⟩` : null, showPhase ? formatPhase(d.phase) : null].filter(Boolean);
            return (
              <g key={d.index} opacity={fade} data-qsphere-dot={d.label}>
                <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={color} strokeWidth={1.5} />
                <circle cx={x} cy={y} r={r} fill={color}>
                  <title>{`|${d.label}⟩ ${(d.probability * 100).toFixed(1)}%, phase ${formatPhase(d.phase)}`}</title>
                </circle>
                {labels.length > 0 && (
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    dominantBaseline={dy < -4 ? "auto" : dy > 4 ? "hanging" : "middle"}
                    className="fill-gray-700 font-mono"
                    fontSize={10}
                  >
                    {labels.join(" ")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <PhaseWheel />
        <button
          type="button"
          onClick={() => setView(DEFAULT_VIEW)}
          className="absolute bottom-0 right-0 inline-flex h-8 w-8 cursor-pointer items-center justify-center default-radius text-gray-500 hover:bg-gray-100"
          aria-label="Reset view"
          title="Reset view"
        >
          <MdRefresh />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700">
        <span className="text-gray-500">Labels</span>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showState} onChange={(e) => setShowState(e.target.checked)} />
          State
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showPhase} onChange={(e) => setShowPhase(e.target.checked)} />
          Phase angle
        </label>
      </div>
    </div>
  );
}

/** The phase colour wheel: 0 on the right, π/2 at the top. */
function PhaseWheel() {
  const r = 18;
  const c = 32;
  const wedges = Array.from({ length: 36 }, (_, i) => {
    const a0 = (i * 2 * Math.PI) / 36;
    const a1 = ((i + 1) * 2 * Math.PI) / 36;
    const pt = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c - r * Math.sin(a)).toFixed(2)}`;
    return <path key={i} d={`M${c} ${c}L${pt(a0)}A${r} ${r} 0 0 0 ${pt(a1)}Z`} fill={phaseColor((a0 + a1) / 2)} stroke={phaseColor((a0 + a1) / 2)} strokeWidth={0.5} />;
  });
  return (
    <svg viewBox="0 0 64 64" className="pointer-events-none absolute right-0 top-0 h-20 w-20" aria-label="Phase" role="img">
      {wedges}
      <circle cx={c} cy={c} r={7} fill="#f9fafb" />
      <g fontSize={8} className="fill-gray-600">
        <text x={c + r + 2} y={c} dominantBaseline="middle">0</text>
        <text x={c} y={c - r - 2} textAnchor="middle">π/2</text>
        <text x={c - r - 2} y={c} textAnchor="end" dominantBaseline="middle">π</text>
        <text x={c} y={c + r + 2} textAnchor="middle" dominantBaseline="hanging">3π/2</text>
      </g>
    </svg>
  );
}

const fmt = (v: number) => {
  const s = v.toFixed(4);
  return s === "-0.0000" ? "0.0000" : s;
};

function AmplitudeTable({ state }: { state: Statevector }) {
  const rows = useMemo(() => statevectorRows(state), [state]);
  return (
    <div className="max-h-80 overflow-auto default-radius border border-gray-100 bg-white" data-statevector>
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-white text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 text-right font-medium">Real</th>
            <th className="px-3 py-2 text-right font-medium">Imaginary</th>
            <th className="px-3 py-2 text-right font-medium">Probability</th>
            <th className="px-3 py-2 text-right font-medium">Phase</th>
          </tr>
        </thead>
        <tbody className="text-gray-700">
          {rows.map((r) => (
            <tr key={r.index} className="border-t border-gray-100">
              <td className="px-3 py-1.5 font-mono">|{r.label}⟩</td>
              <td className="px-3 py-1.5 text-right">{fmt(r.re)}</td>
              <td className="px-3 py-1.5 text-right">{fmt(r.im)}</td>
              <td className="px-3 py-1.5 text-right">{(r.probability * 100).toFixed(2)}%</td>
              <td className="px-3 py-1.5 text-right">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: phaseColor(r.phase) }} />
                {formatPhase(r.phase)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
