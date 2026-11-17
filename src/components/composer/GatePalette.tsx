"use client";

import { GATES, type GateDef, type GateName } from "@/lib/composer/circuit";
import { GATE_COLORS } from "./gateStyles";

export const DRAG_TYPE = "application/x-lr-composer";

/** What a drag from the palette or from a placed gate carries. */
export type DragPayload = { kind: "new"; name: GateName } | { kind: "move"; id: string; grabbedQubit: number };

const GROUPS: { id: GateDef["group"]; label: string }[] = [
  { id: "single", label: "Single qubit" },
  { id: "rotation", label: "Rotations" },
  { id: "multi", label: "Two qubit" },
  { id: "other", label: "Other" },
];

// Gate palette: click a gate to pick it (then click a spot on the grid), or
// drag it onto the grid. Colour-coded by family (gateStyles.ts); hovering or
// focusing a gate shows its name and what it does. RX, RY and RZ use the
// angle typed below them.
export default function GatePalette({
  tool,
  onPick,
  angleText,
  onAngleTextChange,
  angleError,
}: {
  tool: GateName | null;
  onPick: (name: GateName | null) => void;
  angleText: string;
  onAngleTextChange: (text: string) => void;
  angleError: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-4" aria-label="Gates">
      {GROUPS.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 text-xs font-medium text-gray-500">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {GATES.filter((g) => g.group === group.id).map((g) => {
              const active = tool === g.name;
              const tipId = `gate-tip-${g.name}`;
              return (
                <span key={g.name} className="group relative">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      const payload: DragPayload = { kind: "new", name: g.name };
                      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onPick(active ? null : g.name)}
                    aria-pressed={active}
                    aria-describedby={tipId}
                    className={`min-w-10 cursor-grab default-radius border px-2 py-1.5 font-mono text-sm font-semibold transition-shadow ${
                      GATE_COLORS[g.color].box
                    } ${active ? "ring-2 ring-[var(--brand-primary)] ring-offset-1" : "hover:shadow-sm"}`}
                  >
                    {g.label}
                  </button>
                  <span
                    id={tipId}
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-60 default-radius bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block group-focus-within:block"
                  >
                    <span className="block font-semibold">
                      {g.label}: {g.fullName}
                    </span>
                    <span className="mt-0.5 block text-gray-200">{g.description}</span>
                  </span>
                </span>
              );
            })}
          </div>
          {group.id === "rotation" && (
            <label className="mt-2 block text-xs text-gray-500">
              Angle (radians)
              <input
                type="text"
                value={angleText}
                onChange={(e) => onAngleTextChange(e.target.value)}
                spellCheck={false}
                aria-invalid={angleError}
                placeholder="pi/2"
                className={`mt-1 block w-full default-radius border px-2 py-1 font-mono text-sm text-gray-800 focus:outline-none focus:ring-1 ${
                  angleError ? "border-red-300 focus:ring-red-300" : "border-gray-200 focus:ring-gray-300"
                }`}
              />
              {angleError && <span className="mt-1 block text-red-500">Use a number or pi, e.g. pi/4 or 0.5</span>}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
