import { describe, expect, test } from "vitest";
import type { Circuit, GateName, PlacedGate } from "./circuit";
import {
  formatPhase,
  hammingWeight,
  phaseColor,
  phaseHue,
  project,
  qsphereStates,
  spherePosition,
  statevectorRows,
} from "./qsphere";
import { simulate } from "./statevector";

let nextId = 0;
const g = (name: GateName, qubits: number[], column: number, params?: number[]): PlacedGate => ({
  id: `g${nextId++}`,
  name,
  qubits,
  column,
  ...(params ? { params } : {}),
});

describe("qsphere: placement by Hamming weight", () => {
  test("all zeros at the north pole, all ones at the south pole", () => {
    expect(spherePosition(0, 3).z).toBeCloseTo(1, 12);
    expect(spherePosition(0b111, 3).z).toBeCloseTo(-1, 12);
  });

  test("each weight on its own latitude ring, spread evenly", () => {
    const n = 3;
    for (let i = 0; i < 1 << n; i++) {
      expect(spherePosition(i, n).z).toBeCloseTo(Math.cos((Math.PI * hammingWeight(i)) / n), 12);
    }
    // Weight 1: 001, 010, 100 at azimuths 0, 2π/3, 4π/3.
    const ring = [0b001, 0b010, 0b100].map((i) => spherePosition(i, n));
    ring.forEach((p, j) => expect(Math.atan2(p.y, p.x)).toBeCloseTo(normalizeAngle((2 * Math.PI * j) / 3), 12));
    // Same distance between neighbours.
    const d = (a: typeof ring[0], b: typeof ring[0]) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(d(ring[0], ring[1])).toBeCloseTo(d(ring[1], ring[2]), 12);
    expect(d(ring[1], ring[2])).toBeCloseTo(d(ring[2], ring[0]), 12);
  });

  test("dots match spherePosition, only for non-zero amplitudes", () => {
    const c: Circuit = { numQubits: 3, gates: [g("h", [0], 0), g("h", [1], 0)] };
    const dots = qsphereStates(simulate(c));
    expect(dots.map((d) => d.label)).toEqual(["000", "001", "010", "011"]);
    for (const d of dots) {
      const p = spherePosition(d.index, 3);
      expect(d.x).toBeCloseTo(p.x, 12);
      expect(d.y).toBeCloseTo(p.y, 12);
      expect(d.z).toBeCloseTo(p.z, 12);
      expect(d.probability).toBeCloseTo(0.25, 12);
    }
  });

  test("the default view keeps the north pole up", () => {
    expect(project({ x: 0, y: 0, z: 1 }, { yaw: 0.7, pitch: 0.3 }).sy).toBeGreaterThan(0.9);
    expect(project({ x: 0, y: 0, z: 1 }, { yaw: 0, pitch: 0 })).toEqual({ sx: 0, sy: 1, depth: 0 });
  });
});

describe("qsphere: phase to colour", () => {
  test("hue goes round the wheel once", () => {
    expect(phaseHue(0)).toBe(0);
    expect(phaseHue(Math.PI / 2)).toBeCloseTo(90, 9);
    expect(phaseHue(Math.PI)).toBeCloseTo(180, 9);
    expect(phaseHue((3 * Math.PI) / 2)).toBeCloseTo(270, 9);
  });

  test("angles wrap: 2π is 0 and -π/2 is 3π/2", () => {
    expect(phaseColor(2 * Math.PI)).toBe(phaseColor(0));
    expect(phaseColor(2 * Math.PI - 1e-12)).toBe(phaseColor(0));
    expect(phaseColor(-Math.PI / 2)).toBe(phaseColor((3 * Math.PI) / 2));
    expect(phaseColor(0)).not.toBe(phaseColor(Math.PI));
  });

  test("phase labels", () => {
    expect(formatPhase(0)).toBe("0");
    expect(formatPhase(Math.PI / 2)).toBe("π/2");
    expect(formatPhase(-Math.PI / 4)).toBe("7π/4");
    expect(formatPhase(Math.PI)).toBe("π");
    expect(formatPhase(0.37 * Math.PI)).toBe("0.37π");
  });
});

describe("qsphere: states", () => {
  test("Bell pair: two dots, at the poles, phase 0", () => {
    const bell: Circuit = { numQubits: 2, gates: [g("h", [0], 0), g("cx", [0, 1], 1)] };
    const dots = qsphereStates(simulate(bell));
    expect(dots.map((d) => d.label)).toEqual(["00", "11"]);
    expect(dots[0].z).toBeCloseTo(1, 12);
    expect(dots[1].z).toBeCloseTo(-1, 12);
    for (const d of dots) {
      expect(d.probability).toBeCloseTo(0.5, 12);
      expect(d.phase).toBe(0);
    }
  });

  test("relative phase shows; a global phase does not", () => {
    // H then S on one qubit: (|0⟩ + i|1⟩)/√2.
    const plusI = qsphereStates(simulate({ numQubits: 1, gates: [g("h", [0], 0), g("s", [0], 1)] }));
    expect(plusI.map((d) => formatPhase(d.phase))).toEqual(["0", "π/2"]);
    // RZ(θ)|0⟩ is |0⟩ up to a global phase.
    const rz = qsphereStates(simulate({ numQubits: 1, gates: [g("rz", [0], 0, [1.2])] }));
    expect(rz).toHaveLength(1);
    expect(rz[0].phase).toBe(0);
  });

  test("statevector rows: amplitudes as they are, non-zero only", () => {
    const rows = statevectorRows(simulate({ numQubits: 2, gates: [g("h", [0], 0), g("z", [0], 1)] }));
    expect(rows.map((r) => r.label)).toEqual(["00", "01"]);
    expect(rows[0].re).toBeCloseTo(Math.SQRT1_2, 12);
    expect(rows[1].re).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(rows[1].probability).toBeCloseTo(0.5, 12);
    expect(formatPhase(rows[1].phase)).toBe("π");
  });
});

function normalizeAngle(a: number) {
  return a > Math.PI ? a - 2 * Math.PI : a;
}
