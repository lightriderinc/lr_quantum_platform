// Ready-made circuits for the "Submit a job" popup (and, later, the composer).
//
// Every circuit uses only gates in qpu-proxy's shared GATE_SET
// (circuit_spec.py), which IonQ, IQM and Rigetti all accept: h, x, cx, cz,
// ry, rz. Measurements come last, because qpu-proxy rejects any gate after a
// measurement. Each measured qubit q writes classical bit q, so results read
// with the highest bit on the left.

import type { QuantumCircuitInstruction, QuantumCircuitPayload } from "@/lib/quantum/client";

export type CircuitSection = "Basics" | "Randomness" | "Algorithms";
export const CIRCUIT_SECTIONS: CircuitSection[] = ["Basics", "Randomness", "Algorithms"];

/** "h" and "bell" keep the ids the popup's callers already pass as initialCircuit. */
export type CircuitTemplateId = "h" | "bell" | "ghz" | "haar-1" | "haar-2" | "random-4" | "grover-2" | "bv-101";

/** One Haar random rotation: RZ(lambda), then RY(theta), then RZ(phi), in radians. */
export interface HaarAngles {
  qubit: number;
  theta: number;
  phi: number;
  lambda: number;
}

/** A circuit ready to submit, with what to expect from it. */
export interface BuiltCircuit {
  payload: QuantumCircuitPayload;
  /** One line on the result to expect, e.g. "Expect 11 almost every time." */
  expect: string;
  /** The random angles, for Haar random circuits. */
  angles?: HaarAngles[];
}

export interface CircuitTemplate {
  id: CircuitTemplateId;
  section: CircuitSection;
  name: string;
  /** One plain-English line. */
  description: string;
  numQubits: number;
  /** Builds the circuit. Random circuits draw new angles on every call, using `random` (uniform in [0, 1)). */
  build: (random?: () => number) => BuiltCircuit;
}

const h = (q: number): QuantumCircuitInstruction => ({ name: "h", qubits: [q] });
const x = (q: number): QuantumCircuitInstruction => ({ name: "x", qubits: [q] });
const cx = (c: number, t: number): QuantumCircuitInstruction => ({ name: "cx", qubits: [c, t] });
const cz = (a: number, b: number): QuantumCircuitInstruction => ({ name: "cz", qubits: [a, b] });
const ry = (q: number, angle: number): QuantumCircuitInstruction => ({ name: "ry", qubits: [q], params: [angle] });
const rz = (q: number, angle: number): QuantumCircuitInstruction => ({ name: "rz", qubits: [q], params: [angle] });
const measure = (q: number): QuantumCircuitInstruction => ({ name: "measure", qubits: [q], clbits: [q] });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function payload(
  name: string,
  numQubits: number,
  gates: QuantumCircuitInstruction[],
  measured: number[] = range(numQubits),
): QuantumCircuitPayload {
  return {
    format: "lr-circuit/v1",
    name,
    num_qubits: numQubits,
    num_clbits: measured.length,
    instructions: [...gates, ...measured.map(measure)],
  };
}

/**
 * Haar random angles for one qubit: phi and lambda uniform in [0, 2pi),
 * theta = arccos(1 - 2u) with u uniform in [0, 1). Applied to |0>, the
 * chance of reading 1 is sin^2(theta / 2) = u.
 */
export function haarAngles(qubit: number, random: () => number = Math.random): HaarAngles {
  const phi = 2 * Math.PI * random();
  const lambda = 2 * Math.PI * random();
  const theta = Math.acos(1 - 2 * random());
  return { qubit, theta, phi, lambda };
}

/** Chance that a Haar random qubit reads 1. */
export function probabilityOfOne(a: HaarAngles): number {
  return Math.sin(a.theta / 2) ** 2;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function haarGates(angles: HaarAngles[]): QuantumCircuitInstruction[] {
  return angles.flatMap((a) => [rz(a.qubit, a.lambda), ry(a.qubit, a.theta), rz(a.qubit, a.phi)]);
}

// Bernstein-Vazirani: the secret, read with the highest bit on the left, so
// data qubit q holds character SECRET[SECRET.length - 1 - q].
const BV_SECRET = "101";

export const CIRCUIT_TEMPLATES: CircuitTemplate[] = [
  {
    id: "h",
    section: "Basics",
    name: "Superposition",
    description: "One qubit in an equal mix of 0 and 1.",
    numQubits: 1,
    build: () => ({
      payload: payload("superposition", 1, [h(0)]),
      expect: "Expect 0 and 1 about half the time each.",
    }),
  },
  {
    id: "bell",
    section: "Basics",
    name: "Bell pair",
    description: "Two entangled qubits that always agree.",
    numQubits: 2,
    build: () => ({
      payload: payload("bell", 2, [h(0), cx(0, 1)]),
      expect: "Expect 00 and 11 about half the time each, never 01 or 10.",
    }),
  },
  {
    id: "ghz",
    section: "Basics",
    name: "GHZ",
    description: "Three entangled qubits: all 0s or all 1s.",
    numQubits: 3,
    build: () => ({
      payload: payload("ghz", 3, [h(0), cx(0, 1), cx(1, 2)]),
      expect: "Expect 000 and 111 about half the time each.",
    }),
  },
  {
    id: "haar-1",
    section: "Randomness",
    name: "Haar random (1 qubit)",
    description: "One qubit turned to a random direction.",
    numQubits: 1,
    build: (random = Math.random) => {
      const angles = [haarAngles(0, random)];
      return {
        payload: payload("haar-random-1", 1, haarGates(angles)),
        expect: `Expect 1 about ${pct(probabilityOfOne(angles[0]))} of the time.`,
        angles,
      };
    },
  },
  {
    id: "haar-2",
    section: "Randomness",
    name: "Haar random (2 qubits)",
    description: "Each qubit turned to its own random direction.",
    numQubits: 2,
    build: (random = Math.random) => {
      const angles = [haarAngles(0, random), haarAngles(1, random)];
      return {
        payload: payload("haar-random-2", 2, haarGates(angles)),
        expect: `Expect q0 to read 1 about ${pct(probabilityOfOne(angles[0]))} of the time and q1 about ${pct(probabilityOfOne(angles[1]))}.`,
        angles,
      };
    },
  },
  {
    id: "random-4",
    section: "Randomness",
    name: "Random numbers (4 qubits)",
    description: "Each shot is a random 4-bit number.",
    numQubits: 4,
    build: () => ({
      payload: payload("random-numbers", 4, range(4).map(h)),
      expect: "Expect all 16 numbers from 0000 to 1111, each about 1 in 16 times.",
    }),
  },
  {
    id: "grover-2",
    section: "Algorithms",
    name: "Grover search (2 qubits)",
    description: "Finds the marked answer 11 in one step.",
    numQubits: 2,
    build: () => ({
      // Oracle (CZ marks |11>), then the diffuser: H H, X X, CZ, X X, H H.
      payload: payload("grover-11", 2, [h(0), h(1), cz(0, 1), h(0), h(1), x(0), x(1), cz(0, 1), x(0), x(1), h(0), h(1)]),
      expect: "Expect 11 almost every time.",
    }),
  },
  {
    id: "bv-101",
    section: "Algorithms",
    name: "Bernstein-Vazirani (secret 101)",
    description: "Reads a hidden 3-bit string in one query.",
    numQubits: 4,
    build: () => {
      const data = range(BV_SECRET.length);
      const ancilla = BV_SECRET.length;
      const oracle = data.filter((q) => BV_SECRET[BV_SECRET.length - 1 - q] === "1").map((q) => cx(q, ancilla));
      return {
        payload: payload(
          "bernstein-vazirani-101",
          4,
          [x(ancilla), h(ancilla), ...data.map(h), ...oracle, ...data.map(h)],
          data,
        ),
        expect: `Expect ${BV_SECRET} almost every time.`,
      };
    },
  },
];

const BY_ID = new Map(CIRCUIT_TEMPLATES.map((t) => [t.id, t]));

export function circuitTemplate(id: CircuitTemplateId): CircuitTemplate {
  return BY_ID.get(id)!;
}

export function isCircuitTemplateId(value: string | undefined): value is CircuitTemplateId {
  return value !== undefined && BY_ID.has(value as CircuitTemplateId);
}

/** The templates that fit a backend with this many qubits. */
export function templatesForQubits(maxQubits: number): CircuitTemplate[] {
  return CIRCUIT_TEMPLATES.filter((t) => t.numQubits <= maxQubits);
}
