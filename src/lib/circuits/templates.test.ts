import type { Circuit, GateName } from "@/lib/composer/circuit";
import { outcomeProbabilities } from "@/lib/composer/statevector";
import type { QuantumCircuitPayload } from "@/lib/quantum/client";
import { describe, expect, test } from "vitest";
import {
  CIRCUIT_TEMPLATES,
  circuitTemplate,
  haarAngles,
  probabilityOfOne,
  templatesForQubits,
  type CircuitTemplateId,
} from "./templates";

// qpu-proxy's shared GATE_SET entries these circuits may use (circuit_spec.py).
const ALLOWED = new Set(["h", "x", "cx", "cz", "ry", "rz", "measure"]);

/** The payload as a composer circuit, one gate per column, so the composer's statevector can run it. */
function toComposer(p: QuantumCircuitPayload): Circuit {
  return {
    numQubits: p.num_qubits,
    gates: p.instructions.map((inst, i) => ({
      id: String(i),
      name: inst.name as GateName,
      qubits: inst.qubits,
      params: inst.params,
      column: i,
    })),
  };
}

/** Outcome probabilities over the measured bits only, highest bit on the left. */
function outcomes(id: CircuitTemplateId): Map<string, number> {
  const p = circuitTemplate(id).build().payload;
  const bits = p.num_clbits ?? p.num_qubits;
  const sums = new Map<string, number>();
  for (const o of outcomeProbabilities(toComposer(p)).outcomes) {
    const key = o.outcome.slice(-bits);
    sums.set(key, (sums.get(key) ?? 0) + o.probability);
  }
  return sums;
}

describe("circuit templates", () => {
  test("every circuit uses only shared gates, measures last, and fits its qubit count", () => {
    for (const t of CIRCUIT_TEMPLATES) {
      const p = t.build().payload;
      expect(p.format).toBe("lr-circuit/v1");
      expect(p.num_qubits).toBe(t.numQubits);
      let measured = false;
      for (const inst of p.instructions) {
        expect(ALLOWED.has(inst.name), `${t.id}: ${inst.name}`).toBe(true);
        for (const q of inst.qubits) expect(q).toBeLessThan(p.num_qubits);
        if (inst.name === "measure") {
          measured = true;
          expect(inst.clbits![0]).toBeLessThan(p.num_clbits!);
        } else {
          expect(measured, `${t.id}: gate after a measurement`).toBe(false);
        }
      }
      expect(measured).toBe(true);
    }
  });

  test("Grover finds 11", () => {
    expect(outcomes("grover-2").get("11")).toBeCloseTo(1, 10);
  });

  test("Bernstein-Vazirani reads the secret 101 from the 3 data qubits", () => {
    const p = circuitTemplate("bv-101").build().payload;
    expect(p.num_clbits).toBe(3);
    expect(outcomes("bv-101").get("101")).toBeCloseTo(1, 10);
  });

  test("GHZ gives 000 or 111, half each", () => {
    const o = outcomes("ghz");
    expect([...o.keys()].sort()).toEqual(["000", "111"]);
    expect(o.get("000")).toBeCloseTo(0.5, 10);
  });

  test("Bell pair and superposition split 50/50", () => {
    expect([...outcomes("bell").keys()].sort()).toEqual(["00", "11"]);
    expect(outcomes("h").get("1")).toBeCloseTo(0.5, 10);
  });

  test("random numbers: all 16 values equally likely", () => {
    const o = outcomes("random-4");
    expect(o.size).toBe(16);
    for (const p of o.values()) expect(p).toBeCloseTo(1 / 16, 10);
  });

  test("Haar random: angles in range, and P(1) matches the simulator", () => {
    const seq = [0.1, 0.7, 0.3, 0.9, 0.25, 0.6];
    let i = 0;
    const random = () => seq[i++ % seq.length];
    const built = circuitTemplate("haar-2").build(random);
    expect(built.angles).toHaveLength(2);
    const sim = outcomeProbabilities(toComposer(built.payload)).outcomes;
    for (const a of built.angles!) {
      expect(a.phi).toBeGreaterThanOrEqual(0);
      expect(a.phi).toBeLessThan(2 * Math.PI);
      expect(a.theta).toBeGreaterThanOrEqual(0);
      expect(a.theta).toBeLessThanOrEqual(Math.PI);
      const simP1 = sim.filter((o) => o.outcome[o.outcome.length - 1 - a.qubit] === "1").reduce((s, o) => s + o.probability, 0);
      expect(simP1).toBeCloseTo(probabilityOfOne(a), 10);
    }
    // theta = arccos(1 - 2u), so P(1) = u.
    expect(probabilityOfOne(haarAngles(0, () => 0.3))).toBeCloseTo(0.3, 10);
    expect(built.expect).toMatch(/^Expect q0 to read 1 about \d+% of the time and q1 about \d+%\.$/);
  });

  test("new random angles on each build", () => {
    const a = circuitTemplate("haar-1").build().angles![0];
    const b = circuitTemplate("haar-1").build().angles![0];
    expect(a).not.toEqual(b);
  });

  test("circuits wider than the backend are hidden", () => {
    expect(templatesForQubits(2).map((t) => t.id)).toEqual(["h", "bell", "haar-1", "haar-2", "grover-2"]);
    expect(templatesForQubits(20)).toHaveLength(CIRCUIT_TEMPLATES.length);
  });
});
