"use client";

import {
  circuitStats,
  formatAngle,
  gateDef,
  gatesAfterMeasure,
  maxQubitsFor,
  MIN_QUBITS,
  PREVIEW_MAX_QUBITS,
  parseAngle,
  runBlockers,
  toLrCircuit,
  toQasm3,
  type Circuit,
  type GateName,
  type PlacedGate,
} from "@/lib/composer/circuit";
import { editorReducer, initialEditorState } from "@/lib/composer/editor";
import { outcomeProbabilities } from "@/lib/composer/statevector";
import { useEffect, useMemo, useReducer, useState } from "react";
import { MdAdd, MdDeleteOutline, MdPlaylistAddCheck, MdRedo, MdRemove, MdUndo } from "react-icons/md";
import CircuitGrid, { type PendingGate } from "./CircuitGrid";
import GatePalette, { type DragPayload } from "./GatePalette";
import ProbabilityPanel from "./ProbabilityPanel";
import QasmPanel from "./QasmPanel";
import RunPanel, { useRunnableBackends } from "./RunPanel";

// A Bell pair to start from, so the preview and QASM show something useful
// straight away. Fixed ids keep the server and client render identical.
const STARTER: Circuit = {
  numQubits: 2,
  gates: [
    { id: "start-h", name: "h", qubits: [0], column: 0 },
    { id: "start-cx", name: "cx", qubits: [0, 1], column: 1 },
    { id: "start-m0", name: "measure", qubits: [0], column: 2 },
    { id: "start-m1", name: "measure", qubits: [1], column: 2 },
  ],
};

const toolButton =
  "inline-flex h-8 items-center gap-1 default-radius border border-gray-200 bg-white px-2.5 text-sm text-gray-700 transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export default function Composer({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [state, dispatch] = useReducer(editorReducer, STARTER, initialEditorState);
  const circuit = state.present;
  const [tool, setTool] = useState<GateName | null>(null);
  const [angleText, setAngleText] = useState("pi/2");
  const [pending, setPending] = useState<PendingGate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Backend chosen in the run panel: its qubit count is the editor's limit.
  const [backendId, setBackendId] = useState<string | null>(null);
  const { runnable } = useRunnableBackends();
  const chosenBackend = runnable.find((b) => b.id === backendId) ?? null;
  const maxQubits = maxQubitsFor(chosenBackend);

  const angle = parseAngle(angleText);
  const selectedGate = circuit.gates.find((g) => g.id === selectedId) ?? null;

  const payload = useMemo(() => toLrCircuit(circuit), [circuit]);
  const qasm = useMemo(() => toQasm3(circuit), [circuit]);
  const stats = useMemo(() => circuitStats(circuit), [circuit]);
  const preview = useMemo(
    () => (circuit.numQubits <= PREVIEW_MAX_QUBITS ? outcomeProbabilities(circuit) : null),
    [circuit],
  );
  const lateMeasures = useMemo(() => gatesAfterMeasure(circuit), [circuit]);

  function placeAt(name: GateName, qubit: number, column: number) {
    const def = gateDef(name);
    if (def.arity === 2) {
      if (pending && pending.name === name && pending.column === column && pending.first !== qubit) {
        dispatch({ type: "place", name, qubits: [pending.first, qubit], column });
        setPending(null);
      } else {
        setPending({ name: name as PendingGate["name"], column, first: qubit });
      }
      return;
    }
    setPending(null);
    if (def.angle && angle === null) return; // the palette shows why
    dispatch({ type: "place", name, qubits: def.arity === 0 ? [] : [qubit], column, params: def.angle ? [angle!] : undefined });
  }

  function handleCellClick(qubit: number, column: number) {
    setSelectedId(null);
    if (pending && pending.column === column) placeAt(pending.name, qubit, column);
    else if (tool) placeAt(tool, qubit, column);
    else setPending(null);
  }

  function handleDrop(drop: DragPayload, qubit: number, column: number) {
    if (drop.kind === "new") {
      setTool(drop.name);
      placeAt(drop.name, qubit, column);
      return;
    }
    const gate = circuit.gates.find((g) => g.id === drop.id);
    if (!gate) return;
    const shift = qubit - drop.grabbedQubit;
    dispatch({ type: "move", id: gate.id, qubits: gate.qubits.map((q) => q + shift), column });
  }

  function removeGate(id: string) {
    dispatch({ type: "remove", id });
    if (selectedId === id) setSelectedId(null);
  }

  // Keyboard: undo/redo, Delete to remove the selected gate, Escape to cancel.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        dispatch({ type: "remove", id: selectedId });
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setPending(null);
        setSelectedId(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const hint = pending
    ? pending.name === "cx"
      ? `Now click the target qubit in the same step (control is q[${pending.first}]).`
      : `Now click the second qubit in the same step (first is q[${pending.first}]).`
    : tool
      ? `Click a spot on a qubit line to place ${gateDef(tool).label}, or drag it there.`
      : "Pick a gate, then click a spot on a qubit line. You can also drag gates onto the grid, and drag placed gates to move them.";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="default-radius border border-gray-100 bg-gray-50 p-4" aria-label="Circuit editor">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" className={toolButton} onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0} title="Undo (Ctrl+Z)">
              <MdUndo /> Undo
            </button>
            <button type="button" className={toolButton} onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0} title="Redo (Ctrl+Shift+Z)">
              <MdRedo /> Redo
            </button>
            <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />
            <span className="inline-flex items-center gap-1 text-sm text-gray-700">
              <button
                type="button"
                className={toolButton}
                onClick={() => dispatch({ type: "removeQubit" })}
                disabled={circuit.numQubits <= MIN_QUBITS}
                aria-label="Remove the last qubit"
                title="Remove the last qubit and its gates"
              >
                <MdRemove />
              </button>
              <span className="min-w-16 text-center tabular-nums">
                {circuit.numQubits} {circuit.numQubits === 1 ? "qubit" : "qubits"}
              </span>
              <button
                type="button"
                className={toolButton}
                onClick={() => dispatch({ type: "addQubit", max: maxQubits })}
                disabled={circuit.numQubits >= maxQubits}
                aria-label="Add a qubit"
                title={
                  circuit.numQubits >= maxQubits
                    ? chosenBackend
                      ? `${chosenBackend.name} has ${maxQubits} qubits`
                      : `Up to ${maxQubits} qubits until you choose a backend`
                    : "Add a qubit"
                }
              >
                <MdAdd />
              </button>
            </span>
            <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />
            <button type="button" className={toolButton} onClick={() => dispatch({ type: "measureAll" })} title="Measure every qubit that isn't measured yet">
              <MdPlaylistAddCheck /> Measure all
            </button>
            <button
              type="button"
              className={toolButton}
              onClick={() => {
                dispatch({ type: "ghz" });
                setSelectedId(null);
                setPending(null);
              }}
              title={`Replace the circuit with a GHZ state on all ${circuit.numQubits} qubits: H on q[0], a CNOT chain, then measure all`}
            >
              GHZ
            </button>
            <button
              type="button"
              className={toolButton}
              onClick={() => {
                dispatch({ type: "clear" });
                setSelectedId(null);
                setPending(null);
              }}
              disabled={circuit.gates.length === 0}
            >
              <MdDeleteOutline /> Clear
            </button>

            <dl className="ml-auto flex items-center gap-4 text-sm" aria-label="Circuit size">
              <Stat label="Gates" value={stats.gates} />
              <Stat label="Depth" value={stats.depth} />
              <Stat label="Measurements" value={stats.measurements} />
            </dl>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="shrink-0 lg:w-52">
              <GatePalette
                tool={tool}
                onPick={(name) => {
                  setTool(name);
                  setPending(null);
                }}
                angleText={angleText}
                onAngleTextChange={setAngleText}
                angleError={angle === null}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <CircuitGrid
                circuit={circuit}
                pending={pending}
                selectedId={selectedId}
                onCellClick={handleCellClick}
                onDropPayload={handleDrop}
                onSelectGate={(id) => {
                  setSelectedId(id);
                  setPending(null);
                }}
                onRemoveGate={removeGate}
              />
              {selectedGate ? (
                <GateInspector
                  key={`${selectedGate.id}:${selectedGate.params?.[0] ?? ""}`}
                  gate={selectedGate}
                  onAngle={(params) => dispatch({ type: "setParams", id: selectedGate.id, params })}
                  onRemove={() => removeGate(selectedGate.id)}
                  onDone={() => setSelectedId(null)}
                />
              ) : (
                <p className="text-xs text-gray-500" aria-live="polite">
                  {hint}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProbabilityPanel preview={preview} measuredMidCircuit={lateMeasures} />
          <QasmPanel qasm={qasm} />
        </div>
      </div>

      <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <RunPanel
          payload={payload}
          isAuthenticated={isAuthenticated}
          selectedId={backendId}
          onSelect={setBackendId}
          blockers={(backend) => runBlockers(circuit, backend)}
          onMeasureAll={() => dispatch({ type: "measureAll" })}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function GateInspector({
  gate,
  onAngle,
  onRemove,
  onDone,
}: {
  gate: PlacedGate;
  onAngle: (params: number[]) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const def = gateDef(gate.name);
  const [text, setText] = useState(gate.params?.length ? formatAngle(gate.params[0]) : "");
  const parsed = parseAngle(text);
  const where = gate.name === "barrier" ? "every qubit" : gate.qubits.map((q) => `q[${q}]`).join(" and ");

  function commit() {
    if (parsed !== null) onAngle([parsed]);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 default-radius border border-gray-200 bg-white px-3 py-2 text-sm">
      <span className="font-medium text-gray-900">
        {def.title} on {where}
      </span>
      {def.angle && (
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Angle
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            spellCheck={false}
            aria-invalid={parsed === null}
            className={`w-28 default-radius border px-2 py-1 font-mono text-sm text-gray-800 focus:outline-none focus:ring-1 ${
              parsed === null ? "border-red-300 focus:ring-red-300" : "border-gray-200 focus:ring-gray-300"
            }`}
          />
        </label>
      )}
      <span className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onRemove} className="cursor-pointer text-xs font-medium text-red-600 hover:underline">
          Remove
        </button>
        <button type="button" onClick={onDone} className="cursor-pointer text-xs text-gray-500 hover:underline">
          Done
        </button>
      </span>
    </div>
  );
}
