import { describe, expect, test } from "vitest";
import {
  circuitStats,
  DEFAULT_MAX_QUBITS,
  formatAngle,
  fromLrCircuit,
  gatesAfterMeasure,
  isOccupied,
  maxQubitsFor,
  parseAngle,
  runBlockers,
  toLrCircuit,
  toQasm3,
  type Circuit,
  type GateName,
  type PlacedGate,
} from "./circuit";
import {
  CIRCUIT_TEMPLATES,
  circuitTemplate,
  ghzPayload,
  type CircuitTemplate,
  type CircuitTemplateId,
} from "@/lib/circuits/templates";
import { applyEdit, editorReducer, initialEditorState, type EditorState } from "./editor";
import {
  chartAxisMax,
  outcomeProbabilities,
  probabilityChartData,
  qubitSummaries,
  simulate,
} from "./statevector";

let n = 0;
const g = (name: GateName, qubits: number[], column: number, params?: number[]): PlacedGate => ({
  id: `t${n++}`,
  name,
  qubits,
  column,
  ...(params ? { params } : {}),
});
const probs = (circuit: Circuit) =>
  Object.fromEntries(outcomeProbabilities(circuit).outcomes.map((o) => [o.outcome, Number(o.probability.toFixed(6))]));

const BELL: Circuit = {
  numQubits: 2,
  gates: [g("h", [0], 0), g("cx", [0, 1], 1), g("measure", [0], 2), g("measure", [1], 2)],
};

describe("lr-circuit/v1 payload", () => {
  test("Bell state, in program order, one clbit per qubit", () => {
    expect(toLrCircuit(BELL)).toEqual({
      format: "lr-circuit/v1",
      name: "composer",
      num_qubits: 2,
      num_clbits: 2,
      instructions: [
        { name: "h", qubits: [0] },
        { name: "cx", qubits: [0, 1] },
        { name: "measure", qubits: [0], clbits: [0] },
        { name: "measure", qubits: [1], clbits: [1] },
      ],
    });
  });

  test("ordered by column, then top qubit; angles as params; barrier spans every qubit", () => {
    const c: Circuit = {
      numQubits: 3,
      gates: [g("x", [2], 0), g("rz", [1], 1, [0.25]), g("h", [0], 0), g("barrier", [0, 1, 2], 2)],
    };
    expect(toLrCircuit(c).instructions).toEqual([
      { name: "h", qubits: [0] },
      { name: "x", qubits: [2] },
      { name: "rz", qubits: [1], params: [0.25] },
      { name: "barrier", qubits: [0, 1, 2] },
    ]);
  });

  test("the existing preset shape is a subset, so the submit route accepts it unchanged", () => {
    const p = toLrCircuit(BELL);
    expect(typeof p.num_qubits).toBe("number");
    expect(Array.isArray(p.instructions)).toBe(true);
  });
});

describe("OpenQASM 3", () => {
  test("Bell state", () => {
    expect(toQasm3(BELL)).toBe(
      [
        "OPENQASM 3.0;",
        'include "stdgates.inc";',
        "",
        "qubit[2] q;",
        "bit[2] c;",
        "",
        "h q[0];",
        "cx q[0], q[1];",
        "c[0] = measure q[0];",
        "c[1] = measure q[1];",
        "",
      ].join("\n"),
    );
  });

  test("angles as multiples of pi where they are; barriers; no bit register without measurements", () => {
    const c: Circuit = {
      numQubits: 2,
      gates: [g("rx", [0], 0, [Math.PI / 2]), g("ry", [1], 0, [-3 * Math.PI / 4]), g("rz", [0], 1, [0.3]), g("barrier", [0, 1], 2), g("sdg", [1], 3)],
    };
    const qasm = toQasm3(c);
    expect(qasm).not.toMatch(/^bit\[/m);
    expect(qasm).toContain("rx(pi/2) q[0];");
    expect(qasm).toContain("ry(-3*pi/4) q[1];");
    expect(qasm).toContain("rz(0.3) q[0];");
    expect(qasm).toContain("barrier q[0], q[1];");
    expect(qasm).toContain("sdg q[1];");
  });

  test("formatAngle", () => {
    expect(formatAngle(Math.PI)).toBe("pi");
    expect(formatAngle(-Math.PI / 4)).toBe("-pi/4");
    expect(formatAngle(2 * Math.PI)).toBe("2*pi");
    expect(formatAngle(0)).toBe("0");
    expect(formatAngle(1.2345)).toBe("1.2345");
  });
});

describe("angle input", () => {
  test("accepts pi expressions and numbers", () => {
    expect(parseAngle("pi/2")).toBeCloseTo(Math.PI / 2);
    expect(parseAngle("π/4")).toBeCloseTo(Math.PI / 4);
    expect(parseAngle("-3*pi/4")).toBeCloseTo((-3 * Math.PI) / 4);
    expect(parseAngle("2pi")).toBeCloseTo(2 * Math.PI);
    expect(parseAngle("(pi + pi)/4")).toBeCloseTo(Math.PI / 2);
    expect(parseAngle("0.5")).toBe(0.5);
    expect(parseAngle(" 1e-2 ")).toBe(0.01);
  });

  test("rejects anything else, and never evaluates code", () => {
    for (const bad of ["", "abc", "pi/0", "2**3", "alert(1)", "pi)", "(pi", "1..2", "Math.PI"]) {
      expect(parseAngle(bad)).toBeNull();
    }
  });
});

describe("stats and checks", () => {
  test("gate count excludes measurements and barriers; depth counts measurements", () => {
    const c: Circuit = { ...BELL, gates: [...BELL.gates, g("barrier", [0, 1], 3)] };
    expect(circuitStats(c)).toEqual({ gates: 2, measurements: 2, depth: 3 });
    expect(circuitStats({ numQubits: 3, gates: [] })).toEqual({ gates: 0, measurements: 0, depth: 0 });
  });

  test("parallel gates share a layer", () => {
    const c: Circuit = { numQubits: 3, gates: [g("h", [0], 0), g("h", [1], 0), g("h", [2], 0), g("cx", [0, 2], 1)] };
    expect(circuitStats(c).depth).toBe(2);
  });

  test("run checks: needs a measurement, enough qubits, and no gate after a measurement on IonQ", () => {
    const sim = { name: "IonQ Simulator", qubits: 29, provider: "IonQ" };
    const garnet = { name: "IQM Garnet", qubits: 20, provider: "IQM" };
    expect(runBlockers(BELL, sim)).toEqual([]);
    expect(runBlockers({ numQubits: 2, gates: [] }, sim)).toEqual([
      "Add at least one gate.",
      "Add a measurement.",
    ]);
    expect(runBlockers({ numQubits: 2, gates: [g("h", [0], 0)] }, sim)).toEqual([
      "Add a measurement.",
    ]);
    // Qubit count is checked by qubitLimitError (backends.ts), shared with the submit route.
    expect(runBlockers({ ...BELL, numQubits: 12 }, { name: "Tiny", qubits: 5, provider: "IQM" })).toEqual([]);
    const late: Circuit = { numQubits: 1, gates: [g("measure", [0], 0), g("x", [0], 1), g("measure", [0], 2)] };
    expect(runBlockers(late, sim)).toEqual([
      "IonQ measures only at the end. Move the gates after the measurement on qubit 0.",
    ]);
    expect(runBlockers(late, garnet)).toEqual([]);
  });

  test("a gate after a measurement on the same qubit is flagged", () => {
    expect(gatesAfterMeasure(BELL)).toEqual([]);
    const c: Circuit = { numQubits: 2, gates: [g("measure", [0], 0), g("x", [1], 1), g("cx", [1, 0], 2)] };
    expect(gatesAfterMeasure(c)).toEqual([0]);
  });
});

describe("statevector preview", () => {
  test("Bell state: 00 and 11 at one half each", () => {
    expect(probs(BELL)).toEqual({ "00": 0.5, "11": 0.5 });
  });

  test("X on qubit 0 reads 01 (highest bit on the left, like job results)", () => {
    expect(probs({ numQubits: 2, gates: [g("x", [0], 0), g("measure", [0], 1), g("measure", [1], 1)] })).toEqual({ "01": 1 });
  });

  test("only measured qubits; unmeasured bits read 0", () => {
    const c: Circuit = { numQubits: 2, gates: [g("x", [1], 0), g("h", [0], 0), g("measure", [0], 1)] };
    expect(probs(c)).toEqual({ "00": 0.5, "01": 0.5 });
  });

  test("no measurements: every qubit", () => {
    const c: Circuit = { numQubits: 2, gates: [g("x", [1], 0)] };
    expect(outcomeProbabilities(c).basis).toBe("all");
    expect(probs(c)).toEqual({ "10": 1 });
  });

  test("phase gates cancel: H S S† H and H T T† H return to 0; S S = Z; √X √X = X", () => {
    const idS = { numQubits: 1, gates: [g("h", [0], 0), g("s", [0], 1), g("sdg", [0], 2), g("h", [0], 3)] };
    const idT = { numQubits: 1, gates: [g("h", [0], 0), g("t", [0], 1), g("tdg", [0], 2), g("h", [0], 3)] };
    const ssIsZ = { numQubits: 1, gates: [g("h", [0], 0), g("s", [0], 1), g("s", [0], 2), g("h", [0], 3)] };
    const sxsx = { numQubits: 1, gates: [g("sx", [0], 0), g("sx", [0], 1)] };
    expect(probs(idS)).toEqual({ "0": 1 });
    expect(probs(idT)).toEqual({ "0": 1 });
    expect(probs(ssIsZ)).toEqual({ "1": 1 });
    expect(probs(sxsx)).toEqual({ "1": 1 });
  });

  test("rotations: RX(pi) flips, RY(pi/2) is an even split, RZ only changes phase", () => {
    expect(probs({ numQubits: 1, gates: [g("rx", [0], 0, [Math.PI])] })).toEqual({ "1": 1 });
    expect(probs({ numQubits: 1, gates: [g("ry", [0], 0, [Math.PI / 2])] })).toEqual({ "0": 0.5, "1": 0.5 });
    expect(probs({ numQubits: 1, gates: [g("rz", [0], 0, [1.1])] })).toEqual({ "0": 1 });
    expect(probs({ numQubits: 1, gates: [g("ry", [0], 0, [Math.PI / 3])] })).toEqual({ "0": 0.75, "1": 0.25 });
  });

  test("Y, Z, CZ and SWAP", () => {
    expect(probs({ numQubits: 1, gates: [g("y", [0], 0)] })).toEqual({ "1": 1 });
    expect(probs({ numQubits: 1, gates: [g("h", [0], 0), g("z", [0], 1), g("h", [0], 2)] })).toEqual({ "1": 1 });
    // H H, CZ, H on target: |11> after CZ phase flips; with H on both, CZ is a CNOT in disguise.
    const cz = { numQubits: 2, gates: [g("x", [0], 0), g("h", [1], 0), g("cz", [0, 1], 1), g("h", [1], 2)] };
    expect(probs(cz)).toEqual({ "11": 1 });
    expect(probs({ numQubits: 3, gates: [g("x", [0], 0), g("swap", [0, 2], 1)] })).toEqual({ "100": 1 });
  });

  test("per-qubit state: probabilities, phase and purity", () => {
    const one = (gates: PlacedGate[], q = 0) => qubitSummaries(simulate({ numQubits: 2, gates }))[q];
    // |0>: certain 0, no phase to speak of, pure.
    expect(one([])).toMatchObject({ p0: 1, p1: 0, phase: null, purity: 1 });
    // X: certain 1.
    expect(one([g("x", [0], 0)])).toMatchObject({ p0: 0, p1: 1, phase: null });
    // H then S: 50/50 with a phase of pi/2, still pure.
    const hs = one([g("h", [0], 0), g("s", [0], 1)]);
    expect(hs.p1).toBeCloseTo(0.5);
    expect(hs.phase).toBeCloseTo(Math.PI / 2);
    expect(hs.purity).toBeCloseTo(1);
    // H then Z: phase pi.
    expect(Math.abs(one([g("h", [0], 0), g("z", [0], 1)]).phase!)).toBeCloseTo(Math.PI);
    // Bell pair: each qubit alone is fully mixed (purity 0.5, no phase).
    for (const q of [0, 1]) {
      const b = one([g("h", [0], 0), g("cx", [0, 1], 1)], q);
      expect(b.p1).toBeCloseTo(0.5);
      expect(b.phase).toBeNull();
      expect(b.purity).toBeCloseTo(0.5);
    }
  });

  test("chart: every basis state up to 5 bits, top 16 above", () => {
    const bell = probabilityChartData(outcomeProbabilities(BELL), 2);
    expect(bell.mode).toBe("all");
    expect(bell.bars.map((b) => [b.outcome, Number(b.probability.toFixed(3))])).toEqual([
      ["00", 0.5],
      ["01", 0],
      ["10", 0],
      ["11", 0.5],
    ]);
    const five = probabilityChartData(outcomeProbabilities({ numQubits: 5, gates: [] }), 5);
    expect(five.bars).toHaveLength(32);

    // 6 qubits, all in superposition: 64 equal outcomes, only 16 drawn.
    const h6: PlacedGate[] = Array.from({ length: 6 }, (_, q) => g("h", [q], 0));
    const six = probabilityChartData(outcomeProbabilities({ numQubits: 6, gates: h6 }), 6);
    expect(six).toMatchObject({ mode: "top", nonZero: 64 });
    expect(six.bars).toHaveLength(16);
  });

  test("chart axis rounds up to a clean value", () => {
    expect(chartAxisMax(1)).toBe(1);
    expect(chartAxisMax(0.5)).toBe(0.5);
    expect(chartAxisMax(0.51)).toBe(0.6);
    expect(chartAxisMax(0.015625)).toBe(0.05);
  });

  test("the simulator refuses more than 12 qubits instead of allocating 2^n amplitudes", () => {
    expect(() => simulate({ numQubits: 13, gates: [] })).toThrow(RangeError);
    expect(() => outcomeProbabilities({ numQubits: 36, gates: [] })).toThrow(RangeError);
  });

  test("12 qubits, GHZ: two outcomes, normalized", () => {
    const gates: PlacedGate[] = [g("h", [0], 0)];
    for (let q = 1; q < 12; q++) gates.push(g("cx", [q - 1, q], q));
    const state = simulate({ numQubits: 12, gates });
    expect(state.re.length).toBe(4096);
    expect(probs({ numQubits: 12, gates })).toEqual({ "000000000000": 0.5, "111111111111": 0.5 });
  });
});

describe("editor", () => {
  const start = (circuit: Circuit = { numQubits: 2, gates: [] }): EditorState => initialEditorState(circuit);

  test("place, undo, redo", () => {
    let s = start();
    s = editorReducer(s, { type: "place", name: "h", qubits: [0], column: 0 });
    s = editorReducer(s, { type: "place", name: "cx", qubits: [0, 1], column: 1 });
    expect(s.present.gates.map((x) => x.name)).toEqual(["h", "cx"]);
    s = editorReducer(s, { type: "undo" });
    expect(s.present.gates.map((x) => x.name)).toEqual(["h"]);
    s = editorReducer(s, { type: "redo" });
    expect(s.present.gates.map((x) => x.name)).toEqual(["h", "cx"]);
    s = editorReducer(s, { type: "undo" });
    s = editorReducer(s, { type: "place", name: "x", qubits: [1], column: 0 });
    expect(s.future).toEqual([]); // a new edit drops the redo stack
  });

  test("an edit that can't apply adds no undo step", () => {
    let s = start();
    s = editorReducer(s, { type: "place", name: "h", qubits: [0], column: 0 });
    const before = s;
    s = editorReducer(s, { type: "place", name: "x", qubits: [0], column: 0 }); // taken
    s = editorReducer(s, { type: "place", name: "cx", qubits: [0, 0], column: 3 }); // same qubit twice
    s = editorReducer(s, { type: "place", name: "x", qubits: [5], column: 3 }); // no such qubit
    s = editorReducer(s, { type: "undo" });
    s = editorReducer(s, { type: "redo" });
    expect(s.present).toBe(before.present);
  });

  test("a two-qubit gate blocks the rows between its qubits", () => {
    const c = applyEdit({ numQubits: 3, gates: [] }, { type: "place", name: "cx", qubits: [0, 2], column: 0 });
    expect(applyEdit(c, { type: "place", name: "h", qubits: [1], column: 0 })).toBe(c);
    expect(applyEdit(c, { type: "place", name: "h", qubits: [1], column: 1 }).gates).toHaveLength(2);
  });

  test("rotations get a default angle of pi/2, and setParams changes it", () => {
    let c = applyEdit({ numQubits: 1, gates: [] }, { type: "place", name: "rx", qubits: [0], column: 0 });
    expect(c.gates[0].params).toEqual([Math.PI / 2]);
    c = applyEdit(c, { type: "setParams", id: c.gates[0].id, params: [0.1] });
    expect(c.gates[0].params).toEqual([0.1]);
    expect(applyEdit(c, { type: "setParams", id: c.gates[0].id, params: [Number.NaN] })).toBe(c);
  });

  test("move, remove", () => {
    let c = applyEdit({ numQubits: 3, gates: [] }, { type: "place", name: "h", qubits: [0], column: 0 });
    const id = c.gates[0].id;
    c = applyEdit(c, { type: "move", id, qubits: [2], column: 4 });
    expect(c.gates[0]).toMatchObject({ qubits: [2], column: 4 });
    c = applyEdit(c, { type: "remove", id });
    expect(c.gates).toEqual([]);
  });

  test("qubits: 1 up to the limit; removing the last qubit drops its gates; barriers follow", () => {
    let c: Circuit = { numQubits: 2, gates: [] };
    c = applyEdit(c, { type: "place", name: "cx", qubits: [0, 1], column: 0 });
    c = applyEdit(c, { type: "place", name: "h", qubits: [0], column: 1 });
    c = applyEdit(c, { type: "place", name: "barrier", qubits: [], column: 2 });
    expect(c.gates.find((x) => x.name === "barrier")!.qubits).toEqual([0, 1]);
    c = applyEdit(c, { type: "addQubit", max: 36 });
    expect(c.gates.find((x) => x.name === "barrier")!.qubits).toEqual([0, 1, 2]);
    c = applyEdit(c, { type: "removeQubit" });
    c = applyEdit(c, { type: "removeQubit" });
    expect(c.numQubits).toBe(1);
    expect(c.gates.map((x) => x.name)).toEqual(["h", "barrier"]);
    expect(applyEdit(c, { type: "removeQubit" })).toBe(c);
    let big: Circuit = { numQubits: 12, gates: [] };
    expect(applyEdit(big, { type: "addQubit", max: 12 })).toBe(big);
    big = applyEdit(big, { type: "addQubit", max: 36 });
    expect(big.numQubits).toBe(13);
    big = applyEdit(big, { type: "removeQubit" });
    expect(big.numQubits).toBe(12);
  });

  test("limit: the chosen backend's qubits, or 36 with none chosen", () => {
    expect(maxQubitsFor(null)).toBe(DEFAULT_MAX_QUBITS);
    expect(DEFAULT_MAX_QUBITS).toBe(36);
    expect(maxQubitsFor({ qubits: 29 })).toBe(29);
    expect(maxQubitsFor({ qubits: 108 })).toBe(108);
    let c: Circuit = { numQubits: 35, gates: [] };
    c = applyEdit(c, { type: "addQubit", max: maxQubitsFor(null) });
    expect(c.numQubits).toBe(36);
    expect(applyEdit(c, { type: "addQubit", max: maxQubitsFor(null) })).toBe(c);
  });

  test("templates load from the shared list as one undo step", () => {
    const load = (id: CircuitTemplateId, options?: Parameters<CircuitTemplate["build"]>[0]) =>
      fromLrCircuit(circuitTemplate(id).build(options).payload, () => `t${n++}`);

    let s = initialEditorState({ numQubits: 5, gates: [] });
    s = editorReducer(s, { type: "place", name: "x", qubits: [2], column: 4 });
    s = editorReducer(s, { type: "template", circuit: load("ghz") });
    expect(s.present.numQubits).toBe(3);
    expect(toLrCircuit(s.present).instructions).toEqual([
      { name: "h", qubits: [0] },
      { name: "cx", qubits: [0, 1] },
      { name: "cx", qubits: [1, 2] },
      { name: "measure", qubits: [0], clbits: [0] },
      { name: "measure", qubits: [1], clbits: [1] },
      { name: "measure", qubits: [2], clbits: [2] },
    ]);
    expect(probs(s.present)).toEqual({ "000": 0.5, "111": 0.5 });
    s = editorReducer(s, { type: "undo" });
    expect(s.present.numQubits).toBe(5);
    expect(s.present.gates.map((x) => x.name)).toEqual(["x"]);

    // Every shared template lays out with nothing overlapping and measurements last.
    for (const t of CIRCUIT_TEMPLATES) {
      const c = load(t.id);
      expect(c.numQubits).toBe(t.numQubits);
      expect(gatesAfterMeasure(c)).toEqual([]);
      for (const gate of c.gates) expect(isOccupied({ ...c, gates: c.gates.filter((x) => x !== gate) }, gate.column, gate)).toBe(false);
    }

    // Grover and Bernstein-Vazirani give their answers in the composer too.
    expect(probs(load("grover-2"))["11"]).toBeCloseTo(1, 10);
    expect(Object.keys(probs(load("bv-101")))).toEqual(["0101"]);
  });

  test("GHZ (all qubits): a CNOT chain across the current qubit count", () => {
    const four = fromLrCircuit(ghzPayload(4), () => `t${n++}`);
    expect(probs(four)).toEqual({ "0000": 0.5, "1111": 0.5 });
    expect(circuitStats(four)).toEqual({ gates: 4, measurements: 4, depth: 5 });
    // Past the preview limit too (no simulation needed), and on one qubit.
    const big = fromLrCircuit(ghzPayload(36), () => `t${n++}`);
    expect(circuitStats(big)).toEqual({ gates: 36, measurements: 36, depth: 37 });
    expect(toQasm3(big)).toContain("cx q[34], q[35];");
    expect(toLrCircuit(fromLrCircuit(ghzPayload(1), () => `t${n++}`)).instructions).toEqual([
      { name: "h", qubits: [0] },
      { name: "measure", qubits: [0], clbits: [0] },
    ]);
  });

  test("Haar templates keep the angles they were given", () => {
    const angles = [{ qubit: 0, theta: 1.1, phi: 2.2, lambda: 3.3 }];
    const c = fromLrCircuit(circuitTemplate("haar-1").build({ angles }).payload, () => `t${n++}`);
    expect(c.gates.filter((x) => x.name !== "measure").map((x) => [x.name, x.params])).toEqual([
      ["rz", [3.3]],
      ["ry", [1.1]],
      ["rz", [2.2]],
    ]);
  });

  test("measure all: only unmeasured qubits, after every gate", () => {
    let c: Circuit = { numQubits: 3, gates: [] };
    c = applyEdit(c, { type: "place", name: "h", qubits: [0], column: 0 });
    c = applyEdit(c, { type: "place", name: "measure", qubits: [1], column: 0 });
    c = applyEdit(c, { type: "place", name: "x", qubits: [2], column: 3 });
    c = applyEdit(c, { type: "measureAll" });
    const added = c.gates.filter((x) => x.name === "measure" && x.column === 4).map((x) => x.qubits[0]);
    expect(added).toEqual([0, 2]);
    expect(gatesAfterMeasure(c)).toEqual([]);
    expect(applyEdit(c, { type: "measureAll" })).toBe(c);
  });
});
