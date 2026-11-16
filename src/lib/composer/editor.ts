import {
  EMPTY_CIRCUIT,
  gateDef,
  isOccupied,
  MIN_QUBITS,
  type Circuit,
  type GateName,
  type PlacedGate,
} from "./circuit";

// Composer editing as a reducer with undo/redo. Every action that changes
// the circuit pushes the previous one onto `past`; an action that can't
// apply (a cell already taken, a qubit out of range) returns the state
// unchanged, so it never adds an empty undo step.

export const HISTORY_LIMIT = 100;

/** Ready-made circuits in the Templates menu. Each replaces the current circuit as one undo step. */
export type CircuitTemplate = "bell" | "ghz";

export const CIRCUIT_TEMPLATES: { id: CircuitTemplate; label: string; description: string }[] = [
  { id: "bell", label: "Bell pair", description: "H on q[0], CNOT q[0] to q[1], then measure every qubit." },
  { id: "ghz", label: "GHZ", description: "H on q[0], a CNOT chain across every qubit, then measure every qubit." },
];

function measureEvery(numQubits: number, column: number): PlacedGate[] {
  return Array.from({ length: numQubits }, (_, q) => ({ id: newGateId(), name: "measure" as const, qubits: [q], column }));
}

export interface EditorState {
  past: Circuit[];
  present: Circuit;
  future: Circuit[];
}

export type EditorAction =
  | { type: "place"; name: GateName; qubits: number[]; column: number; params?: number[] }
  | { type: "move"; id: string; qubits: number[]; column: number }
  | { type: "remove"; id: string }
  | { type: "setParams"; id: string; params: number[] }
  | { type: "addQubit"; max: number }
  | { type: "removeQubit" }
  | { type: "measureAll" }
  | { type: "template"; template: CircuitTemplate }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export function initialEditorState(circuit: Circuit = EMPTY_CIRCUIT): EditorState {
  return { past: [], present: circuit, future: [] };
}

let idCounter = 0;
export function newGateId(): string {
  idCounter += 1;
  return `g${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** True when `qubits` suit gate `name` on a circuit of `numQubits` qubits. */
export function validQubits(name: GateName, qubits: number[], numQubits: number): boolean {
  const def = gateDef(name);
  if (def.arity === 0) return true;
  if (qubits.length !== def.arity) return false;
  if (qubits.some((q) => !Number.isInteger(q) || q < 0 || q >= numQubits)) return false;
  return new Set(qubits).size === qubits.length;
}

function allQubits(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}

/** The circuit after one editing action, or the same object if it doesn't apply. */
export function applyEdit(circuit: Circuit, action: EditorAction): Circuit {
  switch (action.type) {
    case "place": {
      const qubits = action.name === "barrier" ? allQubits(circuit.numQubits) : action.qubits;
      if (!validQubits(action.name, qubits, circuit.numQubits) || action.column < 0) return circuit;
      if (isOccupied(circuit, action.column, { name: action.name, qubits })) return circuit;
      const gate: PlacedGate = { id: newGateId(), name: action.name, qubits, column: action.column };
      if (gateDef(action.name).angle) gate.params = action.params?.length ? [action.params[0]] : [Math.PI / 2];
      return { ...circuit, gates: [...circuit.gates, gate] };
    }
    case "move": {
      const gate = circuit.gates.find((g) => g.id === action.id);
      if (!gate) return circuit;
      const qubits = gate.name === "barrier" ? allQubits(circuit.numQubits) : action.qubits;
      if (!validQubits(gate.name, qubits, circuit.numQubits) || action.column < 0) return circuit;
      if (gate.column === action.column && qubits.every((q, i) => q === gate.qubits[i])) return circuit;
      if (isOccupied(circuit, action.column, { name: gate.name, qubits }, gate.id)) return circuit;
      return {
        ...circuit,
        gates: circuit.gates.map((g) => (g.id === gate.id ? { ...g, qubits, column: action.column } : g)),
      };
    }
    case "remove": {
      if (!circuit.gates.some((g) => g.id === action.id)) return circuit;
      return { ...circuit, gates: circuit.gates.filter((g) => g.id !== action.id) };
    }
    case "setParams": {
      const gate = circuit.gates.find((g) => g.id === action.id);
      if (!gate || !gateDef(gate.name).angle || !action.params.every(Number.isFinite)) return circuit;
      if (gate.params?.[0] === action.params[0]) return circuit;
      return {
        ...circuit,
        gates: circuit.gates.map((g) => (g.id === gate.id ? { ...g, params: [action.params[0]] } : g)),
      };
    }
    case "addQubit": {
      if (circuit.numQubits >= action.max) return circuit;
      const numQubits = circuit.numQubits + 1;
      return {
        numQubits,
        gates: circuit.gates.map((g) => (g.name === "barrier" ? { ...g, qubits: allQubits(numQubits) } : g)),
      };
    }
    case "removeQubit": {
      if (circuit.numQubits <= MIN_QUBITS) return circuit;
      const numQubits = circuit.numQubits - 1;
      const last = numQubits;
      return {
        numQubits,
        gates: circuit.gates
          .filter((g) => g.name === "barrier" || !g.qubits.includes(last))
          .map((g) => (g.name === "barrier" ? { ...g, qubits: allQubits(numQubits) } : g)),
      };
    }
    case "measureAll": {
      // One measurement per qubit that has none yet, in the first column
      // after every other gate, so nothing comes after it.
      const measured = new Set(circuit.gates.filter((g) => g.name === "measure").map((g) => g.qubits[0]));
      const missing = allQubits(circuit.numQubits).filter((q) => !measured.has(q));
      if (missing.length === 0) return circuit;
      const column = circuit.gates.reduce((max, g) => Math.max(max, g.column + 1), 0);
      return {
        ...circuit,
        gates: [...circuit.gates, ...missing.map((q) => ({ id: newGateId(), name: "measure" as const, qubits: [q], column }))],
      };
    }
    case "template": {
      if (action.template === "bell") {
        // Needs two qubits; a one-qubit circuit grows to two.
        const numQubits = Math.max(2, circuit.numQubits);
        return {
          numQubits,
          gates: [
            { id: newGateId(), name: "h", qubits: [0], column: 0 },
            { id: newGateId(), name: "cx", qubits: [0, 1], column: 1 },
            ...measureEvery(numQubits, 2),
          ],
        };
      }
      // GHZ on every qubit: H on q0, a CNOT chain q0 -> q1 -> ... -> q(n-1),
      // then a measurement on each.
      const n = circuit.numQubits;
      const gates: PlacedGate[] = [{ id: newGateId(), name: "h", qubits: [0], column: 0 }];
      for (let q = 1; q < n; q++) gates.push({ id: newGateId(), name: "cx", qubits: [q - 1, q], column: q });
      return { ...circuit, gates: [...gates, ...measureEvery(n, n)] };
    }
    case "clear":
      return circuit.gates.length === 0 ? circuit : { ...circuit, gates: [] };
    default:
      return circuit;
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (state.future.length === 0) return state;
    const [next, ...rest] = state.future;
    return { past: [...state.past, state.present], present: next, future: rest };
  }
  const next = applyEdit(state.present, action);
  if (next === state.present) return state;
  return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
