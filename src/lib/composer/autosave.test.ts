import { describe, expect, test } from "vitest";
import { AUTOSAVE_KEY, loadAutosave, parseAutosave, saveAutosave } from "./autosave";
import type { Circuit } from "./circuit";
import { editorReducer, initialEditorState } from "./editor";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const grover: Circuit = {
  numQubits: 2,
  gates: [
    { id: "a", name: "h", qubits: [0], column: 0 },
    { id: "b", name: "ry", qubits: [1], column: 0, params: [0.25] },
    { id: "c", name: "cx", qubits: [1, 0], column: 1 },
    { id: "d", name: "measure", qubits: [0], column: 2 },
  ],
};

describe("composer autosave", () => {
  test("saves and restores gates, qubit count, angles, control/target and the template name", () => {
    const store = memoryStore();
    saveAutosave(store, grover, "Grover search (2 qubits)");
    const restored = loadAutosave(store, 36);
    expect(restored).toEqual({ circuit: grover, templateName: "Grover search (2 qubits)" });
    // Restoring starts a fresh editor: no undo step back to the starter circuit.
    let s = editorReducer(initialEditorState({ numQubits: 2, gates: [] }), {
      type: "restore",
      circuit: restored!.circuit,
      templateName: restored!.templateName,
    });
    expect(s.present).toBe(restored!.circuit);
    expect(s.past).toEqual([]);
    // The Templates button keeps the restored name until the circuit is edited.
    expect(s.loaded).toEqual({ name: "Grover search (2 qubits)", circuit: s.present });
    s = editorReducer(s, { type: "place", name: "x", qubits: [1], column: 5 });
    expect(s.loaded?.circuit).not.toBe(s.present);
    s = editorReducer(s, { type: "undo" });
    expect(s.loaded?.circuit).toBe(s.present);
  });

  test("an empty circuit (Clear) removes the save", () => {
    const store = memoryStore();
    saveAutosave(store, grover, null);
    expect(store.data.has(AUTOSAVE_KEY)).toBe(true);
    saveAutosave(store, { numQubits: 2, gates: [] }, null);
    expect(store.data.has(AUTOSAVE_KEY)).toBe(false);
    expect(loadAutosave(store, 36)).toBeNull();
  });

  test("anything off is ignored rather than half-loaded", () => {
    const save = (circuit: unknown) => JSON.stringify({ circuit, templateName: null });
    expect(parseAutosave("not json", 36)).toBeNull();
    expect(parseAutosave(save({ numQubits: 40, gates: [] }), 36)).toBeNull(); // over the limit
    expect(parseAutosave(save({ numQubits: 2, gates: [{ id: "a", name: "nope", qubits: [0], column: 0 }] }), 36)).toBeNull();
    expect(parseAutosave(save({ numQubits: 2, gates: [{ id: "a", name: "cx", qubits: [0, 0], column: 0 }] }), 36)).toBeNull();
    expect(parseAutosave(save({ numQubits: 2, gates: [{ id: "a", name: "rx", qubits: [5], column: 0 }] }), 36)).toBeNull();
    expect(parseAutosave(save({ numQubits: 1, gates: [{ id: "a", name: "rx", qubits: [0], column: 0, params: ["x"] }] }), 36)).toBeNull();
  });

  test("storage that throws (private windows, blocked site data) is no save, not an error", () => {
    const broken = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(loadAutosave(broken, 36)).toBeNull();
    expect(() => saveAutosave(broken, grover, null)).not.toThrow();
    expect(loadAutosave(null, 36)).toBeNull();
  });
});
