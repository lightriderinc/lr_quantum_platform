import type { GateColor } from "@/lib/composer/circuit";

// One colour per gate family, shared by the palette and the placed gates so
// a gate looks the same in both places (qBraid-style colour coding, in our
// Tailwind palette): Pauli and H blue, phase gates violet, rotations and
// the square root of X amber, two-qubit gates emerald, measure and barrier
// neutral grey.
export const GATE_COLORS: Record<GateColor, { box: string }> = {
  pauli: { box: "border-blue-300 bg-blue-50 text-blue-900" },
  phase: { box: "border-violet-300 bg-violet-50 text-violet-900" },
  rotation: { box: "border-amber-300 bg-amber-50 text-amber-900" },
  multi: { box: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  neutral: { box: "border-gray-300 bg-gray-100 text-gray-800" },
};

/** Two-qubit marks on the grid (control dots, connector, target, swap crosses). */
export const MULTI_INK = { fill: "bg-emerald-700", border: "border-emerald-700", text: "text-emerald-700" };
