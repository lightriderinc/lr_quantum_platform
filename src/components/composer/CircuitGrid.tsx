"use client";

import { formatAngle, gateDef, gateSpan, type Circuit, type PlacedGate } from "@/lib/composer/circuit";
import type { QubitSummary } from "@/lib/composer/statevector";
import { MdClose } from "react-icons/md";
import { DRAG_TYPE, type DragPayload } from "./GatePalette";
import { GATE_COLORS, MULTI_INK } from "./gateStyles";

const CELL = 48;
const LABEL = 52;
const BOX = 36;
const MIN_COLUMNS = 12;
/** Width of the per-qubit state column at the right end of the lines. */
const STATE_COL = 48;

/** A two-qubit gate waiting for its second qubit: first qubit picked in `column`. */
export interface PendingGate {
  name: "cx" | "cz" | "swap";
  column: number;
  first: number;
}

// The circuit grid: one row per qubit, one column per step. Empty cells
// place the picked gate (or a dropped one); placed gates can be selected,
// dragged to another spot, or removed with their x. While a gate is picked
// (`placing`), clicking or dropping on a placed gate places there instead,
// replacing it (see editor.ts). Drawn with positioned
// elements rather than SVG so every cell and gate is a real button. When the
// circuit is small enough to simulate, each line ends in a circle filled by
// that qubit's probability of reading 1.
export default function CircuitGrid({
  circuit,
  pending,
  placing,
  selectedId,
  onCellClick,
  onDropPayload,
  onSelectGate,
  onRemoveGate,
  qubitStates,
}: {
  circuit: Circuit;
  /** Per-qubit state from the preview simulation; null above the preview limit (no indicators). */
  qubitStates: QubitSummary[] | null;
  pending: PendingGate | null;
  /** A palette gate is picked (or a two-qubit gate waits for its second qubit): clicks on placed gates place, not select. */
  placing: boolean;
  selectedId: string | null;
  onCellClick: (qubit: number, column: number) => void;
  onDropPayload: (payload: DragPayload, qubit: number, column: number) => void;
  onSelectGate: (id: string) => void;
  onRemoveGate: (id: string) => void;
}) {
  const { numQubits, gates } = circuit;
  const columns = Math.max(MIN_COLUMNS, gates.reduce((max, g) => Math.max(max, g.column + 3), 0));
  const width = LABEL + columns * CELL;
  const height = numQubits * CELL;
  const rowCenter = (q: number) => q * CELL + CELL / 2;
  const colLeft = (c: number) => LABEL + c * CELL;

  function readDrop(e: React.DragEvent): DragPayload | null {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DragPayload;
    } catch {
      return null;
    }
  }

  return (
    <div className="flex default-radius border border-gray-100 bg-white">
      <div className="min-w-0 flex-1 overflow-x-auto">
      <div className="relative select-none" style={{ width, height: height + 8, paddingTop: 4 }}>
        <div className="absolute inset-x-0" style={{ top: 4, height }}>
          {/* Qubit labels and wires */}
          {Array.from({ length: numQubits }, (_, q) => (
            <div key={`wire-${q}`}>
              <span
                className="absolute flex items-center justify-end pr-2 font-mono text-xs text-gray-500"
                style={{ left: 0, width: LABEL, top: q * CELL, height: CELL }}
              >
                q[{q}]
              </span>
              <span className="absolute h-px bg-gray-300" style={{ left: LABEL, right: 0, top: rowCenter(q) }} />
            </div>
          ))}

          {/* Empty cells: click or drop to place */}
          {Array.from({ length: numQubits }, (_, q) =>
            Array.from({ length: columns }, (_, c) => {
              const isPendingFirst = pending?.column === c && pending.first === q;
              const isPendingTarget = pending?.column === c && pending.first !== q;
              return (
                <button
                  key={`cell-${q}-${c}`}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Qubit ${q}, step ${c + 1}`}
                  onClick={() => onCellClick(q, c)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const payload = readDrop(e);
                    if (payload) onDropPayload(payload, q, c);
                  }}
                  className={`absolute cursor-pointer rounded transition-colors hover:bg-gray-100 ${
                    isPendingFirst ? "bg-[var(--brand-primary)]/15 ring-2 ring-[var(--brand-primary)]" : ""
                  } ${isPendingTarget ? "bg-[var(--brand-primary)]/5" : ""}`}
                  style={{ left: colLeft(c) + 2, top: q * CELL + 2, width: CELL - 4, height: CELL - 4 }}
                />
              );
            }),
          )}

          {/* Placed gates */}
          {gates.map((gate) => (
            <GateMark
              key={gate.id}
              gate={gate}
              numQubits={numQubits}
              selected={gate.id === selectedId}
              left={colLeft(gate.column)}
              rowCenter={rowCenter}
              onSelect={(qubit) => (placing ? onCellClick(qubit, gate.column) : onSelectGate(gate.id))}
              onDrop={(e, qubit) => {
                const payload = readDrop(e);
                if (payload) onDropPayload(payload, qubit, gate.column);
              }}
              onRemove={() => onRemoveGate(gate.id)}
            />
          ))}
        </div>
      </div>
      </div>

      {qubitStates && (
        <div
          className="relative shrink-0 border-l border-gray-100"
          style={{ width: STATE_COL, height: height + 8, paddingTop: 4 }}
          aria-label="Qubit states"
        >
          {qubitStates.map((s) => (
            <QubitStateDot key={s.qubit} state={s} top={4 + s.qubit * CELL} />
          ))}
        </div>
      )}
    </div>
  );
}

// A circle filled from the bottom by P(1), with the qubit's numbers on hover
// or keyboard focus.
function QubitStateDot({ state, top }: { state: QubitSummary; top: number }) {
  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
  const rows: [string, string][] = [
    ["Prob of |0⟩", pct(state.p0)],
    ["Prob of |1⟩", pct(state.p1)],
    ["Phase φ", state.phase === null ? "not defined" : formatAngle(state.phase)],
    ["Purity", state.purity.toFixed(2)],
  ];
  const tipId = `qubit-state-${state.qubit}`;
  return (
    <div className="group absolute inset-x-0 flex items-center justify-center" style={{ top, height: CELL }}>
      <span
        tabIndex={0}
        aria-describedby={tipId}
        aria-label={`q[${state.qubit}]: probability of 1 is ${pct(state.p1)}`}
        className="relative block h-6 w-6 overflow-hidden rounded-full border-2 border-gray-400 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <span className="absolute inset-x-0 bottom-0 bg-blue-500 transition-all duration-300" style={{ height: `${state.p1 * 100}%` }} />
      </span>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 z-30 mr-1 hidden w-44 -translate-y-1/2 default-radius bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-within:block"
      >
        <span className="mb-1 block font-semibold">q[{state.qubit}]</span>
        {rows.map(([k, v]) => (
          <span key={k} className="flex justify-between gap-3">
            <span className="text-gray-300">{k}</span>
            <span className="font-mono tabular-nums">{v}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function GateMark({
  gate,
  numQubits,
  selected,
  left,
  rowCenter,
  onSelect,
  onDrop,
  onRemove,
}: {
  gate: PlacedGate;
  numQubits: number;
  selected: boolean;
  left: number;
  rowCenter: (q: number) => number;
  /** With the qubit row under the pointer. */
  onSelect: (qubit: number) => void;
  onDrop: (e: React.DragEvent, qubit: number) => void;
  onRemove: () => void;
}) {
  const def = gateDef(gate.name);
  const [lo, hi] = gateSpan(gate, numQubits);
  const top = lo * CELL;
  const spanHeight = (hi - lo + 1) * CELL;
  const ring = selected ? "ring-2 ring-[var(--brand-primary)] ring-offset-1" : "";
  const label =
    gate.name === "measure" ? "Measure" : `${def.label}${gate.params?.length ? `(${formatAngle(gate.params[0])})` : ""}`;
  const where = gate.qubits.map((q) => `q[${q}]`).join(", ");
  // The qubit row under the pointer, within the gate's span.
  const rowAt = (el: Element, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return lo + Math.min(hi - lo, Math.max(0, Math.floor((clientY - rect.top) / CELL)));
  };

  return (
    <div
      className="group absolute"
      style={{ left, top, width: CELL, height: spanHeight }}
      draggable
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e, rowAt(e.currentTarget, e.clientY));
      }}
      onDragStart={(e) => {
        const grabbedQubit = rowAt(e.currentTarget, e.clientY);
        const payload: DragPayload = { kind: "move", id: gate.id, grabbedQubit };
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <button
        type="button"
        onClick={(e) => onSelect(e.clientY ? rowAt(e.currentTarget, e.clientY) : lo)}
        aria-label={`${label} on ${gate.name === "barrier" ? "every qubit" : where}`}
        aria-pressed={selected}
        className="absolute inset-0 cursor-pointer"
      >
        {gate.name === "barrier" ? (
          <span
            className={`absolute inset-y-1 left-1/2 w-3 -translate-x-1/2 rounded-sm border-x-2 border-dashed border-gray-400 bg-gray-100/70 ${ring}`}
          />
        ) : def.arity === 2 ? (
          <TwoQubitMark gate={gate} lo={lo} rowCenter={rowCenter} ring={ring} />
        ) : (
          <span
            className={`absolute flex items-center justify-center rounded border font-mono font-semibold ${
              gate.name === "measure" ? "border-gray-500 bg-gray-700 text-white" : GATE_COLORS[def.color].box
            } ${ring}`}
            style={{
              left: (CELL - BOX) / 2,
              top: (CELL - BOX) / 2,
              width: BOX,
              height: BOX,
              fontSize: def.label.length > 2 || def.angle ? 11 : 13,
            }}
            title={`${def.fullName}${gate.params?.length ? ` (${formatAngle(gate.params[0])})` : ""}: ${def.description}`}
          >
            {gate.name === "measure" ? <MeterIcon /> : def.label}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className={`absolute z-10 h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white text-xs text-gray-500 shadow-sm hover:text-red-600 ${
          selected ? "flex" : "hidden group-hover:flex group-focus-within:flex"
        }`}
        style={{ left: (CELL + BOX) / 2 - 10, top: (CELL - BOX) / 2 - 8 }}
      >
        <MdClose />
      </button>
    </div>
  );
}

function TwoQubitMark({
  gate,
  lo,
  rowCenter,
  ring,
}: {
  gate: PlacedGate;
  lo: number;
  rowCenter: (q: number) => number;
  ring: string;
}) {
  const offset = lo * CELL;
  const y = (q: number) => rowCenter(q) - offset;
  const [a, b] = gate.qubits;
  const top = Math.min(y(a), y(b));
  const bottom = Math.max(y(a), y(b));
  const dot = (q: number) => (
    <span key={`dot-${q}`} className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${MULTI_INK.fill}`} style={{ left: CELL / 2, top: y(q) }} />
  );
  const cross = (q: number) => (
    <span
      key={`x-${q}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 text-lg font-bold leading-none ${MULTI_INK.text}`}
      style={{ left: CELL / 2, top: y(q) }}
    >
      ×
    </span>
  );
  const target = (q: number) => (
    <span
      key={`t-${q}`}
      className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white text-base font-bold leading-none ${MULTI_INK.border} ${MULTI_INK.text}`}
      style={{ left: CELL / 2, top: y(q) }}
    >
      +
    </span>
  );
  return (
    <span className={`absolute inset-0 rounded ${ring}`} title={`${gateDef(gate.name).fullName}: ${gateDef(gate.name).description}`}>
      <span className={`absolute w-0.5 -translate-x-1/2 ${MULTI_INK.fill}`} style={{ left: CELL / 2, top, height: bottom - top }} />
      {gate.name === "cx" && [dot(a), target(b)]}
      {gate.name === "cz" && [dot(a), dot(b)]}
      {gate.name === "swap" && [cross(a), cross(b)]}
    </span>
  );
}

function MeterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 17 A8 8 0 0 1 20 17" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 17 L17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
