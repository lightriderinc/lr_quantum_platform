import { orderedGates, PREVIEW_MAX_QUBITS, type Circuit, type PlacedGate } from "./circuit";

// In-browser statevector simulation for the composer's probability preview.
// At most PREVIEW_MAX_QUBITS (12) qubits, 4,096 amplitudes, so a plain loop
// over the state per gate is instant; larger circuits are refused rather
// than allocating 2^n amplitudes. Qubit q is bit q of the basis-state index (qiskit's
// little-endian order), and outcome keys are printed with the highest
// classical bit on the left, the same as job results.
//
// It is an ideal preview: no noise, and every measurement is treated as if it
// were at the end of the circuit (the composer warns when one isn't).

type C = [number, number]; // [re, im]
type Matrix2 = [C, C, C, C]; // [[a, b], [c, d]] row by row

const S2 = Math.SQRT1_2;
const c = (re: number, im = 0): C => [re, im];
const expI = (theta: number): C => [Math.cos(theta), Math.sin(theta)];

function singleQubitMatrix(gate: PlacedGate): Matrix2 | null {
  const theta = gate.params?.[0] ?? 0;
  const ch = Math.cos(theta / 2);
  const sh = Math.sin(theta / 2);
  switch (gate.name) {
    case "h": return [c(S2), c(S2), c(S2), c(-S2)];
    case "x": return [c(0), c(1), c(1), c(0)];
    case "y": return [c(0), c(0, -1), c(0, 1), c(0)];
    case "z": return [c(1), c(0), c(0), c(-1)];
    case "s": return [c(1), c(0), c(0), c(0, 1)];
    case "sdg": return [c(1), c(0), c(0), c(0, -1)];
    case "t": return [c(1), c(0), c(0), expI(Math.PI / 4)];
    case "tdg": return [c(1), c(0), c(0), expI(-Math.PI / 4)];
    case "sx": return [c(0.5, 0.5), c(0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5)];
    case "rx": return [c(ch), c(0, -sh), c(0, -sh), c(ch)];
    case "ry": return [c(ch), c(-sh), c(sh), c(ch)];
    case "rz": return [expI(-theta / 2), c(0), c(0), expI(theta / 2)];
    default: return null;
  }
}

export interface Statevector {
  numQubits: number;
  re: Float64Array;
  im: Float64Array;
}

/** Final state of the circuit's gates from |0...0>, ignoring measurements and barriers. */
export function simulate(circuit: Circuit): Statevector {
  const n = circuit.numQubits;
  if (n > PREVIEW_MAX_QUBITS) {
    throw new RangeError(`The preview simulates up to ${PREVIEW_MAX_QUBITS} qubits; this circuit has ${n}.`);
  }
  const size = 1 << n;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re[0] = 1;

  for (const gate of orderedGates(circuit)) {
    if (gate.name === "measure" || gate.name === "barrier") continue;
    if (gate.name === "cx" || gate.name === "cz" || gate.name === "swap") {
      const [a, b] = gate.qubits;
      const ma = 1 << a;
      const mb = 1 << b;
      for (let i = 0; i < size; i++) {
        if (gate.name === "cx") {
          // Swap each |control=1, target=0> with |control=1, target=1>, once.
          if (i & ma && !(i & mb)) swap(re, im, i, i | mb);
        } else if (gate.name === "cz") {
          if (i & ma && i & mb) {
            re[i] = -re[i];
            im[i] = -im[i];
          }
        } else if (i & ma && !(i & mb)) {
          swap(re, im, i, (i & ~ma) | mb);
        }
      }
      continue;
    }
    const m = singleQubitMatrix(gate);
    if (!m) continue;
    const mask = 1 << gate.qubits[0];
    const [[ar, ai], [br, bi], [cr, ci], [dr, di]] = m;
    for (let i = 0; i < size; i++) {
      if (i & mask) continue;
      const j = i | mask;
      const x0r = re[i], x0i = im[i], x1r = re[j], x1i = im[j];
      re[i] = ar * x0r - ai * x0i + br * x1r - bi * x1i;
      im[i] = ar * x0i + ai * x0r + br * x1i + bi * x1r;
      re[j] = cr * x0r - ci * x0i + dr * x1r - di * x1i;
      im[j] = cr * x0i + ci * x0r + dr * x1i + di * x1r;
    }
  }
  return { numQubits: n, re, im };
}

function swap(re: Float64Array, im: Float64Array, i: number, j: number) {
  const r = re[i], m = im[i];
  re[i] = re[j];
  im[i] = im[j];
  re[j] = r;
  im[j] = m;
}

export interface OutcomeProbability {
  /** Bitstring, highest bit on the left. */
  outcome: string;
  probability: number;
}

export interface ProbabilityPreview {
  /** "measured": over the classical bits the measurements write; "all": no measurements, so over every qubit. */
  basis: "measured" | "all";
  outcomes: OutcomeProbability[];
}

/**
 * Outcome probabilities, largest first, dropping ones below 1e-10. With
 * measurements, keys are the circuit's classical bits (one per qubit,
 * unmeasured bits read 0), matching what a job returns; without any, keys
 * are every qubit.
 */
export function outcomeProbabilities(circuit: Circuit, state: Statevector = simulate(circuit)): ProbabilityPreview {
  const n = circuit.numQubits;
  // clbit -> qubit; the last measurement into a bit wins, as on hardware.
  const clbitSource = new Map<number, number>();
  for (const g of orderedGates(circuit)) {
    if (g.name === "measure") clbitSource.set(g.qubits[0], g.qubits[0]);
  }
  const basis = clbitSource.size > 0 ? "measured" : "all";
  const sums = new Map<number, number>();
  for (let i = 0; i < state.re.length; i++) {
    const p = state.re[i] * state.re[i] + state.im[i] * state.im[i];
    if (p < 1e-15) continue;
    let key = i;
    if (basis === "measured") {
      key = 0;
      for (const [clbit, qubit] of clbitSource) if (i & (1 << qubit)) key |= 1 << clbit;
    }
    sums.set(key, (sums.get(key) ?? 0) + p);
  }
  const outcomes = [...sums.entries()]
    .filter(([, p]) => p > 1e-10)
    .map(([key, p]) => ({ outcome: key.toString(2).padStart(n, "0"), probability: p }))
    .sort((a, b) => b.probability - a.probability || a.outcome.localeCompare(b.outcome));
  return { basis, outcomes };
}

// --- Per-qubit state (the indicator at the end of each qubit line) ---------

export interface QubitSummary {
  qubit: number;
  /** Probability of reading 0 and 1. */
  p0: number;
  p1: number;
  /** Relative phase of 1 against 0 in radians, (-pi, pi]; null when the qubit has no coherence to measure it by (it is 0, 1, or fully mixed). */
  phase: number | null;
  /** Tr(rho^2) of the qubit on its own: 1 when it is in a pure state, 0.5 when fully entangled or mixed. */
  purity: number;
}

/**
 * Each qubit's reduced state, from the final statevector: the probabilities
 * of 0 and 1, the relative phase, and the purity. A qubit entangled with
 * others has purity below 1, which is what a Bloch-sphere arrow can't show.
 */
export function qubitSummaries(state: Statevector): QubitSummary[] {
  const { numQubits, re, im } = state;
  const out: QubitSummary[] = [];
  for (let q = 0; q < numQubits; q++) {
    const mask = 1 << q;
    let p1 = 0;
    let p0 = 0;
    // rho_10 = sum over pairs of a(i|mask) * conj(a(i)).
    let cRe = 0;
    let cIm = 0;
    for (let i = 0; i < re.length; i++) {
      if (i & mask) continue;
      const j = i | mask;
      p0 += re[i] * re[i] + im[i] * im[i];
      p1 += re[j] * re[j] + im[j] * im[j];
      cRe += re[j] * re[i] + im[j] * im[i];
      cIm += im[j] * re[i] - re[j] * im[i];
    }
    const coherence = Math.hypot(cRe, cIm);
    out.push({
      qubit: q,
      p0,
      p1,
      phase: coherence > 1e-9 ? Math.atan2(cIm, cRe) : null,
      purity: p0 * p0 + p1 * p1 + 2 * coherence * coherence,
    });
  }
  return out;
}

// --- Probabilities chart ---------------------------------------------------

/** Every basis state is drawn up to this many bits (32 bars); above it, only the most likely outcomes. */
export const CHART_ALL_STATES_MAX_BITS = 5;
export const CHART_TOP_OUTCOMES = 16;

export interface ChartData {
  /** "all": every basis state in order, zeros included; "top": the most likely non-zero outcomes, largest first. */
  mode: "all" | "top";
  bars: OutcomeProbability[];
  /** Non-zero outcomes in total (to say how many are not drawn). */
  nonZero: number;
}

export function probabilityChartData(preview: ProbabilityPreview, bits: number): ChartData {
  const nonZero = preview.outcomes.length;
  if (bits <= CHART_ALL_STATES_MAX_BITS) {
    const byOutcome = new Map(preview.outcomes.map((o) => [o.outcome, o.probability]));
    const bars = Array.from({ length: 1 << bits }, (_, i) => {
      const outcome = i.toString(2).padStart(bits, "0");
      return { outcome, probability: byOutcome.get(outcome) ?? 0 };
    });
    return { mode: "all", bars, nonZero };
  }
  return { mode: "top", bars: preview.outcomes.slice(0, CHART_TOP_OUTCOMES), nonZero };
}

/** Top of the chart's y axis: the smallest round value at or above the largest bar. */
export function chartAxisMax(maxProbability: number): number {
  for (const step of [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 1]) {
    if (maxProbability <= step + 1e-12) return step;
  }
  return 1;
}
