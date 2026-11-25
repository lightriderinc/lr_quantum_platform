import type { Statevector } from "./statevector";

// The composer's Q-sphere and statevector table, from the in-browser
// statevector. Pure, so placement, phase colours and the table are unit tested.
//
// Q-sphere (as in IBM Quantum Composer): one dot per basis state with a
// non-zero amplitude. |00…0⟩ sits at the north pole, |11…1⟩ at the south
// pole, and every other state on the latitude ring of its Hamming weight
// (number of 1s). Each ring holds all C(n, k) states of its weight, spread
// evenly in index order, so a state's place never moves as the circuit changes.

/** Amplitudes smaller than this (probability below 1e-10) count as zero. */
const ZERO_PROBABILITY = 1e-10;

const TAU = 2 * Math.PI;

export function hammingWeight(i: number): number {
  let k = 0;
  for (let v = i; v; v &= v - 1) k++;
  return k;
}

/** Bitstring of basis state `index`, highest qubit on the left (as in job results). */
export function basisLabel(index: number, numQubits: number): string {
  return index.toString(2).padStart(numQubits, "0");
}

export interface SpherePoint {
  /** z is up: north pole (0, 0, 1). */
  x: number;
  y: number;
  z: number;
}

/**
 * Where basis state `index` sits on the unit sphere: polar angle π·k/n for
 * Hamming weight k, and the j-th of the ring's C(n, k) states at azimuth 2π·j/C(n, k).
 */
export function spherePosition(index: number, numQubits: number): SpherePoint {
  const k = hammingWeight(index);
  const theta = numQubits === 0 ? 0 : (Math.PI * k) / numQubits;
  // Rank among the states of the same weight, and how many there are.
  let rank = 0;
  let count = 0;
  for (let i = 0; i < 1 << numQubits; i++) {
    if (hammingWeight(i) !== k) continue;
    if (i < index) rank++;
    count++;
  }
  const phi = (TAU * rank) / count;
  return { x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) };
}

/** Any angle as a phase in [0, 2π). */
export function normalizePhase(phase: number): number {
  const p = phase % TAU;
  const out = p < 0 ? p + TAU : p;
  // Rounding just below 2π reads as 0.
  return TAU - out < 1e-9 ? 0 : out;
}

/** Hue (0 to 360) of a phase on the colour wheel: 0 red, π/2 yellow-green, π cyan, 3π/2 violet. */
export function phaseHue(phase: number): number {
  return (normalizePhase(phase) / TAU) * 360;
}

export function phaseColor(phase: number): string {
  return `hsl(${phaseHue(phase).toFixed(1)} 80% 48%)`;
}

/** 0, π/4, π/2, …; other angles as a multiple of π ("0.37π"). */
export function formatPhase(phase: number): string {
  const p = normalizePhase(phase);
  const quarters = (p / Math.PI) * 4;
  const q = Math.round(quarters);
  if (Math.abs(quarters - q) < 1e-6) {
    const names = ["0", "π/4", "π/2", "3π/4", "π", "5π/4", "3π/2", "7π/4"];
    return names[q % 8];
  }
  return `${(p / Math.PI).toFixed(2)}π`;
}

export interface SphereState extends SpherePoint {
  index: number;
  label: string;
  probability: number;
  /** Phase in [0, 2π) after removing the global phase (the most likely state reads 0). */
  phase: number;
  weight: number;
}

/**
 * The dots of the Q-sphere. A global phase can't be observed, so, as in
 * qiskit's plot_state_qsphere, phases are shown relative to the most likely
 * state (the first one on a tie), which then reads 0.
 */
export function qsphereStates(state: Statevector): SphereState[] {
  const { numQubits, re, im } = state;
  let top = 0;
  let topP = -1;
  for (let i = 0; i < re.length; i++) {
    const p = re[i] * re[i] + im[i] * im[i];
    if (p > topP + 1e-12) {
      top = i;
      topP = p;
    }
  }
  const globalPhase = Math.atan2(im[top], re[top]);
  // Positions for every state of each weight in one pass (spherePosition per dot would be quadratic).
  const counts = new Array<number>(numQubits + 1).fill(0);
  for (let i = 0; i < re.length; i++) counts[hammingWeight(i)]++;
  const seen = new Array<number>(numQubits + 1).fill(0);
  const out: SphereState[] = [];
  for (let i = 0; i < re.length; i++) {
    const k = hammingWeight(i);
    const rank = seen[k]++;
    const probability = re[i] * re[i] + im[i] * im[i];
    if (probability < ZERO_PROBABILITY) continue;
    const theta = numQubits === 0 ? 0 : (Math.PI * k) / numQubits;
    const phi = (TAU * rank) / counts[k];
    out.push({
      index: i,
      label: basisLabel(i, numQubits),
      probability,
      phase: normalizePhase(Math.atan2(im[i], re[i]) - globalPhase),
      weight: k,
      x: Math.sin(theta) * Math.cos(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(theta),
    });
  }
  return out;
}

export interface AmplitudeRow {
  index: number;
  label: string;
  re: number;
  im: number;
  probability: number;
  /** Phase of the amplitude as it is, in [0, 2π). */
  phase: number;
}

/** The statevector table: every non-zero amplitude, in basis order. */
export function statevectorRows(state: Statevector): AmplitudeRow[] {
  const rows: AmplitudeRow[] = [];
  for (let i = 0; i < state.re.length; i++) {
    const re = state.re[i];
    const im = state.im[i];
    const probability = re * re + im * im;
    if (probability < ZERO_PROBABILITY) continue;
    rows.push({ index: i, label: basisLabel(i, state.numQubits), re, im, probability, phase: normalizePhase(Math.atan2(im, re)) });
  }
  return rows;
}

// --- View -----------------------------------------------------------------

export interface View {
  /** Turn about the vertical (z) axis, radians. */
  yaw: number;
  /** Tilt towards the viewer, radians: positive shows the top of the sphere. */
  pitch: number;
}

export const DEFAULT_VIEW: View = { yaw: -Math.PI / 6, pitch: 0.35 };

/**
 * Orthographic projection of a sphere point: sx to the right and sy up, in
 * sphere radii, and depth (positive towards the viewer).
 */
export function project(p: SpherePoint, view: View): { sx: number; sy: number; depth: number } {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  // Turn about z.
  const x1 = p.x * cy - p.y * sy;
  const y1 = p.x * sy + p.y * cy;
  // Tilt about the screen's x axis; the viewer looks along -y.
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const up = p.z * cp + y1 * sp;
  const depth = -y1 * cp + p.z * sp;
  return { sx: x1, sy: up, depth };
}
