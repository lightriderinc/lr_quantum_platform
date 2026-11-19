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

/** A circuit ready to submit. */
export interface BuiltCircuit {
  payload: QuantumCircuitPayload;
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
  /**
   * Builds the circuit. Random circuits draw new angles on every call, using
   * `random` (uniform in [0, 1)), unless `angles` gives them (one per qubit,
   * e.g. carried over to the composer).
   */
  build: (options?: BuildOptions) => BuiltCircuit;
}

export interface BuildOptions {
  random?: () => number;
  angles?: HaarAngles[];
}

/** Preset angles when they cover every qubit, otherwise new random ones. */
function haarFor(numQubits: number, { random = Math.random, angles }: BuildOptions = {}): HaarAngles[] {
  if (angles && angles.length === numQubits && angles.every((a, q) => a.qubit === q)) return angles;
  return range(numQubits).map((q) => haarAngles(q, random));
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

function haarGates(angles: HaarAngles[]): QuantumCircuitInstruction[] {
  return angles.flatMap((a) => [rz(a.qubit, a.lambda), ry(a.qubit, a.theta), rz(a.qubit, a.phi)]);
}

/**
 * GHZ on n qubits: H on q0, a CNOT chain q0 -> q1 -> ... -> q(n-1), then
 * measure every qubit. The shared "GHZ" uses 3; the composer's "GHZ (all
 * qubits)" uses the circuit's current qubit count.
 */
export function ghzPayload(numQubits: number): QuantumCircuitPayload {
  return payload("ghz", numQubits, [h(0), ...range(numQubits - 1).map((q) => cx(q, q + 1))]);
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
    }),
  },
  {
    id: "ghz",
    section: "Basics",
    name: "GHZ",
    description: "Three entangled qubits: all 0s or all 1s.",
    numQubits: 3,
    build: () => ({
      payload: ghzPayload(3),
    }),
  },
  {
    id: "haar-1",
    section: "Randomness",
    name: "Haar random (1 qubit)",
    description: "One qubit turned to a random direction.",
    numQubits: 1,
    build: (options) => {
      const angles = haarFor(1, options);
      return {
        payload: payload("haar-random-1", 1, haarGates(angles)),
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
    build: (options) => {
      const angles = haarFor(2, options);
      return {
        payload: payload("haar-random-2", 2, haarGates(angles)),
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
      };
    },
  },
];

const BY_ID = new Map(CIRCUIT_TEMPLATES.map((t) => [t.id, t]));

export function circuitTemplate(id: CircuitTemplateId): CircuitTemplate {
  return BY_ID.get(id)!;
}

/**
 * The template a submitted circuit came from, by its payload `name` (e.g.
 * "bell" -> "Bell pair"), for job details. Null for anything else, such as
 * "composer" or an API user's own name. "ghz" covers both GHZ entries.
 */
export function templateNameFor(payloadName: string | undefined): string | null {
  if (!payloadName) return null;
  PAYLOAD_NAMES ??= new Map(CIRCUIT_TEMPLATES.map((t) => [t.build().payload.name ?? "", t.name]));
  return PAYLOAD_NAMES.get(payloadName) ?? null;
}
let PAYLOAD_NAMES: Map<string, string> | undefined;

export function isCircuitTemplateId(value: string | undefined): value is CircuitTemplateId {
  return value !== undefined && BY_ID.has(value as CircuitTemplateId);
}

/** The templates that fit a backend with this many qubits. */
export function templatesForQubits(maxQubits: number): CircuitTemplate[] {
  return CIRCUIT_TEMPLATES.filter((t) => t.numQubits <= maxQubits);
}

// --- Opening a template in the composer -----------------------------------
// /composer?template=haar-2&angles=theta,phi,lambda;theta,phi,lambda
// Angles go in full precision, so the composer builds exactly the circuit
// the popup showed.

/** Link to /composer with this template loaded (and its Haar angles, if any). */
export function composerHref(id: CircuitTemplateId, built: BuiltCircuit): string {
  const params = new URLSearchParams({ template: id });
  if (built.angles) params.set("angles", built.angles.map((a) => [a.theta, a.phi, a.lambda].join(",")).join(";"));
  return `/composer?${params.toString()}`;
}

/** The template a /composer link asks for, built with its angles; null when the link names none. Bad angles fall back to new random ones. */
export function templateFromQuery(
  template: string | string[] | undefined,
  angles: string | string[] | undefined,
): { template: CircuitTemplate; built: BuiltCircuit } | null {
  const id = Array.isArray(template) ? template[0] : template;
  if (!isCircuitTemplateId(id)) return null;
  const raw = Array.isArray(angles) ? angles[0] : angles;
  let parsed: HaarAngles[] | undefined;
  if (raw) {
    const rows = raw.split(";").map((row) => row.split(",").map(Number));
    if (rows.every((r) => r.length === 3 && r.every(Number.isFinite))) {
      parsed = rows.map(([theta, phi, lambda], qubit) => ({ qubit, theta, phi, lambda }));
    }
  }
  const t = circuitTemplate(id);
  return { template: t, built: t.build({ angles: parsed }) };
}
