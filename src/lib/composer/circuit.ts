// Circuit model for the /composer page: the gates a user has placed on the
// grid, and everything derived from them (the lr-circuit/v1 payload that
// /api/lr/quantum/submit forwards to qpu-proxy, OpenQASM 3, counts, depth,
// backend warnings). Pure functions only, so all of it is unit tested.
//
// lr-circuit/v1 is the Light Rider SDK's payload (lightrider/circuit.py):
// { format, name, num_qubits, num_clbits, instructions: [{ name, qubits,
// params?, clbits? }] }, angles in radians, gate names as in its GATE_SET.
// Every gate in the palette below is one qpu-proxy's IonQ adapter emits
// verbatim (its _NATIVE set), and a qiskit method for IQM.

/** The in-browser preview simulates up to this many qubits (2^12 amplitudes); above it, only the chart is hidden. */
export const PREVIEW_MAX_QUBITS = 12;
/** Most qubits the editor allows when no backend is chosen. */
export const DEFAULT_MAX_QUBITS = 36;
export const MIN_QUBITS = 1;

/** Qubit limit for the editor: the chosen backend's qubit count, or DEFAULT_MAX_QUBITS with none chosen. */
export function maxQubitsFor(backend: { qubits: number } | null | undefined): number {
  return backend && backend.qubits >= MIN_QUBITS ? backend.qubits : DEFAULT_MAX_QUBITS;
}

export type GateName =
  | "h" | "x" | "y" | "z" | "s" | "t" | "sdg" | "tdg" | "sx"
  | "rx" | "ry" | "rz"
  | "cx" | "cz" | "swap"
  | "measure" | "barrier";

/** Colour family on the palette and grid, as on qBraid: Pauli and H, phase, rotation (with the square root of X), multi-qubit, and neutral for measure and barrier. */
export type GateColor = "pauli" | "phase" | "rotation" | "multi" | "neutral";

export interface GateDef {
  name: GateName;
  /** Text on the palette button and on the placed gate. */
  label: string;
  /** Full name for tooltips, e.g. "Hadamard". */
  fullName: string;
  /** One plain-English line on what it does, for tooltips. */
  description: string;
  /** Number of qubits the user picks: 1, 2, or 0 for the barrier (always every qubit). */
  arity: 0 | 1 | 2;
  /** Takes one angle (RX, RY, RZ). */
  angle?: true;
  group: "single" | "rotation" | "multi" | "other";
  color: GateColor;
}

export const GATES: GateDef[] = [
  { name: "h", label: "H", fullName: "Hadamard", description: "Puts the qubit in a 50/50 superposition of 0 and 1.", arity: 1, group: "single", color: "pauli" },
  { name: "x", label: "X", fullName: "Pauli X", description: "Flips 0 to 1 and 1 to 0, like a classical NOT.", arity: 1, group: "single", color: "pauli" },
  { name: "y", label: "Y", fullName: "Pauli Y", description: "Flips the qubit and adds a phase: a half turn about the Y axis.", arity: 1, group: "single", color: "pauli" },
  { name: "z", label: "Z", fullName: "Pauli Z", description: "Flips the phase of 1 and leaves 0 alone.", arity: 1, group: "single", color: "pauli" },
  { name: "s", label: "S", fullName: "S (phase)", description: "Adds a quarter-turn phase (pi/2) to 1.", arity: 1, group: "single", color: "phase" },
  { name: "t", label: "T", fullName: "T (phase)", description: "Adds an eighth-turn phase (pi/4) to 1.", arity: 1, group: "single", color: "phase" },
  { name: "sdg", label: "S†", fullName: "S dagger", description: "Undoes S: a phase of minus pi/2 on 1.", arity: 1, group: "single", color: "phase" },
  { name: "tdg", label: "T†", fullName: "T dagger", description: "Undoes T: a phase of minus pi/4 on 1.", arity: 1, group: "single", color: "phase" },
  { name: "sx", label: "√X", fullName: "Square root of X", description: "Half of an X: two in a row flip the qubit.", arity: 1, group: "single", color: "rotation" },
  { name: "rx", label: "RX", fullName: "Rotation about X", description: "Turns the qubit about the X axis by the angle you set.", arity: 1, angle: true, group: "rotation", color: "rotation" },
  { name: "ry", label: "RY", fullName: "Rotation about Y", description: "Turns the qubit about the Y axis by the angle you set.", arity: 1, angle: true, group: "rotation", color: "rotation" },
  { name: "rz", label: "RZ", fullName: "Rotation about Z", description: "Changes the qubit's phase by the angle you set.", arity: 1, angle: true, group: "rotation", color: "rotation" },
  { name: "cx", label: "CNOT", fullName: "Controlled NOT", description: "Flips the target qubit when the control qubit is 1. Pick the control, then the target.", arity: 2, group: "multi", color: "multi" },
  { name: "cz", label: "CZ", fullName: "Controlled Z", description: "Flips the phase when both qubits are 1. Pick any two qubits.", arity: 2, group: "multi", color: "multi" },
  { name: "swap", label: "SWAP", fullName: "Swap", description: "Swaps the states of two qubits.", arity: 2, group: "multi", color: "multi" },
  { name: "measure", label: "M", fullName: "Measure", description: "Reads the qubit as 0 or 1 into the classical bit with the same number.", arity: 1, group: "other", color: "neutral" },
  { name: "barrier", label: "Barrier", fullName: "Barrier", description: "Stops the compiler from moving gates across this point. Covers every qubit.", arity: 0, group: "other", color: "neutral" },
];

const GATE_BY_NAME = new Map(GATES.map((g) => [g.name, g]));

export function gateDef(name: GateName): GateDef {
  return GATE_BY_NAME.get(name)!;
}

/** One gate on the grid. `qubits` is in gate order (control first for CNOT). */
export interface PlacedGate {
  id: string;
  name: GateName;
  qubits: number[];
  /** Angles in radians, for RX, RY, RZ. */
  params?: number[];
  column: number;
}

export interface Circuit {
  numQubits: number;
  gates: PlacedGate[];
}

export const EMPTY_CIRCUIT: Circuit = { numQubits: 2, gates: [] };

/** Rows a gate covers in its column: its qubit span, or every row for a barrier. */
export function gateSpan(gate: Pick<PlacedGate, "name" | "qubits">, numQubits: number): [number, number] {
  if (gate.name === "barrier") return [0, numQubits - 1];
  return [Math.min(...gate.qubits), Math.max(...gate.qubits)];
}

/** True when a gate on `qubits` in `column` would overlap a gate already there (other than `ignoreId`). */
export function isOccupied(
  circuit: Circuit,
  column: number,
  candidate: Pick<PlacedGate, "name" | "qubits">,
  ignoreId?: string,
): boolean {
  const [lo, hi] = gateSpan(candidate, circuit.numQubits);
  return circuit.gates.some((g) => {
    if (g.column !== column || g.id === ignoreId) return false;
    const [glo, ghi] = gateSpan(g, circuit.numQubits);
    return glo <= hi && lo <= ghi;
  });
}

/** Gates in program order: by column, then top qubit. */
export function orderedGates(circuit: Circuit): PlacedGate[] {
  return [...circuit.gates].sort(
    (a, b) => a.column - b.column || gateSpan(a, circuit.numQubits)[0] - gateSpan(b, circuit.numQubits)[0],
  );
}

// --- lr-circuit/v1 --------------------------------------------------------

export interface LrInstruction {
  name: GateName;
  qubits: number[];
  params?: number[];
  clbits?: number[];
}

export interface LrCircuitPayload {
  format: "lr-circuit/v1";
  name: string;
  num_qubits: number;
  num_clbits: number;
  instructions: LrInstruction[];
}

/** The payload sent to /api/lr/quantum/submit. One classical bit per qubit; a measure on qubit q writes bit q. */
export function toLrCircuit(circuit: Circuit, name = "composer"): LrCircuitPayload {
  const all = Array.from({ length: circuit.numQubits }, (_, i) => i);
  return {
    format: "lr-circuit/v1",
    name,
    num_qubits: circuit.numQubits,
    num_clbits: circuit.numQubits,
    instructions: orderedGates(circuit).map((g): LrInstruction => {
      if (g.name === "barrier") return { name: "barrier", qubits: all };
      if (g.name === "measure") return { name: "measure", qubits: [g.qubits[0]], clbits: [g.qubits[0]] };
      return g.params?.length ? { name: g.name, qubits: [...g.qubits], params: [...g.params] } : { name: g.name, qubits: [...g.qubits] };
    }),
  };
}

// --- OpenQASM 3 ----------------------------------------------------------

/** An angle as text: a simple multiple of pi when it is one ("pi/2", "-3*pi/4"), otherwise a decimal. */
export function formatAngle(radians: number): string {
  if (!Number.isFinite(radians)) return "0";
  if (Math.abs(radians) < 1e-12) return "0";
  for (const den of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const num = (radians / Math.PI) * den;
    const rounded = Math.round(num);
    if (rounded !== 0 && Math.abs(num - rounded) < 1e-9) {
      const sign = rounded < 0 ? "-" : "";
      const n = Math.abs(rounded);
      const head = n === 1 ? "pi" : `${n}*pi`;
      return `${sign}${head}${den === 1 ? "" : `/${den}`}`;
    }
  }
  return String(Number(radians.toPrecision(10)));
}

/** Read-only OpenQASM 3 for the circuit, using the standard gate library. */
export function toQasm3(circuit: Circuit): string {
  const payload = toLrCircuit(circuit);
  const hasMeasure = payload.instructions.some((i) => i.name === "measure");
  const q = (i: number) => `q[${i}]`;
  const lines = ["OPENQASM 3.0;", 'include "stdgates.inc";', "", `qubit[${payload.num_qubits}] q;`];
  if (hasMeasure) lines.push(`bit[${payload.num_clbits}] c;`);
  if (payload.instructions.length > 0) lines.push("");
  for (const inst of payload.instructions) {
    if (inst.name === "measure") {
      lines.push(`c[${inst.clbits![0]}] = measure ${q(inst.qubits[0])};`);
    } else if (inst.name === "barrier") {
      lines.push(`barrier ${inst.qubits.map(q).join(", ")};`);
    } else {
      const args = inst.params?.length ? `(${inst.params.map(formatAngle).join(", ")})` : "";
      lines.push(`${inst.name}${args} ${inst.qubits.map(q).join(", ")};`);
    }
  }
  return lines.join("\n") + "\n";
}

// --- Stats and checks ----------------------------------------------------

export interface CircuitStats {
  /** Gates, not counting measurements or barriers. */
  gates: number;
  measurements: number;
  /** Longest chain of operations on any qubit, measurements included, barriers not (as qiskit counts it). */
  depth: number;
}

export function circuitStats(circuit: Circuit): CircuitStats {
  const level = new Array<number>(circuit.numQubits).fill(0);
  let gates = 0;
  let measurements = 0;
  for (const g of orderedGates(circuit)) {
    if (g.name === "barrier") continue;
    if (g.name === "measure") measurements++;
    else gates++;
    const next = Math.max(...g.qubits.map((q) => level[q] ?? 0)) + 1;
    for (const q of g.qubits) level[q] = next;
  }
  return { gates, measurements, depth: Math.max(0, ...level) };
}

/**
 * Qubits that have a gate after their measurement. IonQ rejects these (it
 * measures every qubit once, at the end), and the in-browser preview treats
 * every measurement as if it were at the end.
 */
export function gatesAfterMeasure(circuit: Circuit): number[] {
  const measured = new Set<number>();
  const bad = new Set<number>();
  for (const g of orderedGates(circuit)) {
    if (g.name === "barrier") continue;
    if (g.name === "measure") {
      measured.add(g.qubits[0]);
      continue;
    }
    for (const q of g.qubits) if (measured.has(q)) bad.add(q);
  }
  return [...bad].sort((a, b) => a - b);
}

/**
 * Why this circuit can't be sent to `backend` yet, in plain words; empty when
 * it can. The server and qpu-proxy check again: this only saves a round trip
 * and explains the fix.
 */
export function runBlockers(
  circuit: Circuit,
  backend: { name: string; qubits: number; provider: string },
): string[] {
  const reasons: string[] = [];
  const stats = circuitStats(circuit);
  if (stats.gates === 0 && stats.measurements === 0) reasons.push("Add at least one gate.");
  if (stats.measurements === 0) reasons.push("Add a measurement. Results only include measured qubits.");
  if (backend.qubits < circuit.numQubits) {
    reasons.push(`${backend.name} has ${backend.qubits} qubits and this circuit uses ${circuit.numQubits}.`);
  }
  if (backend.provider.startsWith("IonQ")) {
    const late = gatesAfterMeasure(circuit);
    if (late.length > 0) {
      reasons.push(
        `IonQ measures every qubit once, at the end. Move the gates after the measurement on qubit ${late.join(", ")}.`,
      );
    }
  }
  return reasons;
}

// --- Angle input -----------------------------------------------------------

/**
 * Parses an angle typed by the user, in radians: numbers, pi (or π), + - * /
 * and parentheses, e.g. "pi/2", "-3*pi/4", "0.5", "2pi". Returns null for
 * anything else. A tiny recursive-descent parser: never eval.
 */
export function parseAngle(input: string): number | null {
  const src = input.replace(/π/g, "pi").replace(/\s+/g, "").toLowerCase();
  if (src === "") return null;
  let i = 0;
  const peek = () => src[i];

  function number(): number | null {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }
  function primary(): number | null {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    if (src.startsWith("pi", i)) {
      i += 2;
      return Math.PI;
    }
    const n = number();
    if (n === null) return null;
    // "2pi" means 2*pi.
    if (src.startsWith("pi", i)) {
      i += 2;
      return n * Math.PI;
    }
    return n;
  }
  function unary(): number | null {
    if (peek() === "-" || peek() === "+") {
      const sign = src[i++] === "-" ? -1 : 1;
      const v = unary();
      return v === null ? null : sign * v;
    }
    return primary();
  }
  function term(): number | null {
    let v = unary();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = src[i++];
      const r = unary();
      if (r === null) return null;
      if (op === "/" && r === 0) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number | null {
    let v = term();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = src[i++];
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const value = expr();
  return value !== null && i === src.length && Number.isFinite(value) ? value : null;
}

/**
 * An lr-circuit/v1 circuit (e.g. a shared template from
 * lib/circuits/templates.ts) laid out on the grid: each gate in the first
 * column free on every row it spans, all measurements in one final column.
 * Measurements land on the classical bit of the same number, as the grid
 * always does. `newId` names each gate; pass fixed ids for a server render.
 */
export function fromLrCircuit(
  payload: { num_qubits: number; instructions: { name: string; qubits: number[]; params?: number[] }[] },
  newId: () => string,
): Circuit {
  const n = payload.num_qubits;
  const nextFree = new Array<number>(n).fill(0);
  const gates: PlacedGate[] = [];
  const measured: number[] = [];
  for (const inst of payload.instructions) {
    if (!GATE_BY_NAME.has(inst.name as GateName)) throw new Error(`The composer has no ${inst.name} gate.`);
    const name = inst.name as GateName;
    if (name === "measure") {
      measured.push(inst.qubits[0]);
      continue;
    }
    const [lo, hi] = gateSpan({ name, qubits: inst.qubits }, n);
    let column = 0;
    for (let q = lo; q <= hi; q++) column = Math.max(column, nextFree[q]);
    for (let q = lo; q <= hi; q++) nextFree[q] = column + 1;
    const gate: PlacedGate = { id: newId(), name, qubits: name === "barrier" ? Array.from({ length: n }, (_, i) => i) : inst.qubits, column };
    if (inst.params?.length) gate.params = [...inst.params];
    gates.push(gate);
  }
  const last = Math.max(0, ...nextFree);
  for (const q of measured) gates.push({ id: newId(), name: "measure", qubits: [q], column: last });
  return { numQubits: n, gates };
}
