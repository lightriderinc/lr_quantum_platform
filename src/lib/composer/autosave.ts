import { GATES, MIN_QUBITS, type Circuit, type GateName, type PlacedGate } from "./circuit";
import { validQubits } from "./editor";

// The composer keeps the current circuit in this browser's localStorage, so a
// reload or a return visit picks up where the user left off. Per browser only
// (nothing reaches the server); a ?template= link still wins over it, and an
// empty circuit (Clear) removes it. Storage can be missing or throw (private
// windows, blocked site data): every access is guarded, and without it the
// composer simply starts from its usual circuit.

export const AUTOSAVE_KEY = "lr-composer:autosave:v1";

export interface Autosave {
  circuit: Circuit;
  /** The template the circuit was loaded from, shown on the Templates button; null once edited. */
  templateName: string | null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const GATE_NAMES = new Set<string>(GATES.map((g) => g.name));

/** The browser's localStorage, or null where it's unavailable. */
export function browserStorage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A saved circuit, checked gate by gate; null if anything about it is off (it's then ignored, never half-loaded). */
export function parseAutosave(raw: string | null, maxQubits: number): Autosave | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { circuit, templateName } = data as { circuit?: unknown; templateName?: unknown };
  if (!circuit || typeof circuit !== "object") return null;
  const { numQubits, gates } = circuit as { numQubits?: unknown; gates?: unknown };
  if (!Number.isInteger(numQubits) || (numQubits as number) < MIN_QUBITS || (numQubits as number) > maxQubits) return null;
  if (!Array.isArray(gates)) return null;

  const n = numQubits as number;
  const out: PlacedGate[] = [];
  const ids = new Set<string>();
  for (const g of gates) {
    if (!g || typeof g !== "object") return null;
    const { id, name, qubits, column, params } = g as Record<string, unknown>;
    if (typeof id !== "string" || ids.has(id) || typeof name !== "string" || !GATE_NAMES.has(name)) return null;
    if (!Array.isArray(qubits) || !Number.isInteger(column) || (column as number) < 0) return null;
    const gateName = name as GateName;
    const qs = gateName === "barrier" ? Array.from({ length: n }, (_, i) => i) : (qubits as number[]);
    if (!validQubits(gateName, qs, n)) return null;
    if (params !== undefined && (!Array.isArray(params) || !params.every((p) => typeof p === "number" && Number.isFinite(p)))) return null;
    ids.add(id);
    out.push({ id, name: gateName, qubits: [...qs], column: column as number, ...(params ? { params: [...(params as number[])] } : {}) });
  }
  return { circuit: { numQubits: n, gates: out }, templateName: typeof templateName === "string" ? templateName : null };
}

export function loadAutosave(store: Store | null, maxQubits: number): Autosave | null {
  try {
    return parseAutosave(store?.getItem(AUTOSAVE_KEY) ?? null, maxQubits);
  } catch {
    return null;
  }
}

/** Saves the circuit, or removes the save when it has no gates. */
export function saveAutosave(store: Store | null, circuit: Circuit, templateName: string | null): void {
  try {
    if (circuit.gates.length === 0) store?.removeItem(AUTOSAVE_KEY);
    else store?.setItem(AUTOSAVE_KEY, JSON.stringify({ circuit, templateName } satisfies Autosave));
  } catch {
    // Full or blocked storage: autosave is a convenience, never an error.
  }
}
