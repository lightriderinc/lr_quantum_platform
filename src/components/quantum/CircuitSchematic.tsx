"use client";

import type { BuiltCircuit, CircuitTemplate } from "@/lib/circuits/templates";
import type { QuantumCircuitInstruction, QuantumCircuitPayload } from "@/lib/quantum/client";

/** The two hand-drawn circuits the classroom uses. The submit popup draws any template with TemplateSchematic. */
export type CircuitType = "h" | "bell";
export type CircuitSchematicTheme = "light" | "chalk";

interface Props {
  circuit: CircuitType;
  className?: string;
  /** "light" (default) draws a bordered card for a white background, e.g. the submit modal.
   * "chalk" draws bare white-on-transparent strokes meant to sit directly on a ChalkboardPanel. */
  theme?: CircuitSchematicTheme;
}

const META: Record<CircuitType, { title: string; description: string }> = {
  h: { title: "H Gate", description: "1-qubit superposition" },
  bell: { title: "Bell State", description: "2-qubit entangled pair" },
};

// bg-emerald-900, matching ChalkboardPanel — used to "mask" wires behind
// gate/measurement boxes on the chalk theme the same way the light theme
// masks them with a white box fill.
const CHALK_BG = "#064e3b";

interface Colors {
  wire: string;
  label: string;
  boxFill: string;
  boxStroke: string;
  gateLabel: string;
  meter: string;
  controlDot: string;
  connector: string;
  targetFill: string;
}

const THEME_COLORS: Record<CircuitSchematicTheme, Colors> = {
  light: {
    wire: "#9ca3af",
    label: "#6b7280",
    boxFill: "white",
    boxStroke: "#d1d5db",
    gateLabel: "#111827",
    meter: "#4b5563",
    controlDot: "#111827",
    connector: "#111827",
    targetFill: "white",
  },
  chalk: {
    wire: "#9ca3af",
    label: "white",
    boxFill: CHALK_BG,
    boxStroke: "white",
    gateLabel: "white",
    meter: "white",
    controlDot: "white",
    connector: "white",
    targetFill: CHALK_BG,
  },
};

export default function CircuitSchematic({
  circuit,
  className = "",
  theme = "light",
}: Props) {
  const meta = META[circuit];
  const colors = THEME_COLORS[theme];
  const diagram =
    circuit === "h" ? (
      <HGateCircuit colors={colors} />
    ) : (
      <BellCircuit colors={colors} />
    );

  if (theme === "chalk") {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {diagram}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 border border-gray-100 bg-gray-100 p-4 ${className}`}
    >
      <p className="text-sm font-semibold text-gray-700">Circuit Diagram</p>
      {diagram}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">{meta.title}</p>
        <p className="text-xs text-gray-500">{meta.description}</p>
      </div>
    </div>
  );
}

/**
 * The submit popup's panel: draws whichever template circuit is selected,
 * then its name, description, the result to expect and, for Haar random
 * circuits, the angles drawn this time.
 */
export function TemplateSchematic({
  template,
  built,
  className = "",
}: {
  template: CircuitTemplate;
  built: BuiltCircuit;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 border border-gray-100 bg-gray-100 p-4 ${className}`}>
      <p className="text-sm font-semibold text-gray-700">Circuit Diagram</p>
      <CircuitDiagram payload={built.payload} label={`${template.name} circuit diagram`} />
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">{template.name}</p>
        <p className="text-xs text-gray-500">{template.description}</p>
        <p className="mt-2 text-xs font-medium text-gray-700" data-expect>
          {built.expect}
        </p>
        {built.angles && (
          <div className="mt-2 space-y-0.5 font-mono text-[11px] text-gray-500" data-angles>
            {built.angles.map((a) => (
              <p key={a.qubit}>
                {built.angles!.length > 1 ? `q${a.qubit}: ` : ""}θ {a.theta.toFixed(2)}, φ {a.phi.toFixed(2)}, λ{" "}
                {a.lambda.toFixed(2)}
              </p>
            ))}
            <p className="font-sans">Angles in radians. New ones each time you pick this circuit.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Layout for CircuitDiagram, matching the hand-drawn H and Bell pictures:
// 30x26 gate boxes, 50 px between qubit wires.
const WIRE_GAP = 50;
const TOP = 36;
const FIRST_COL = 56;
const COL_PITCH = 38;
const BOX_W = 30;
const BOX_H = 26;
const MIN_SCALE = 0.8;

const GATE_TEXT: Record<string, string> = { h: "H", x: "X", y: "Y", z: "Z", s: "S", t: "T", sdg: "S†", tdg: "T†", sx: "√X", rx: "RX", ry: "RY", rz: "RZ" };

/**
 * Any lr-circuit/v1 circuit as an SVG: each gate goes in the first column
 * free on every wire it spans, and all measurements share a final column.
 */
export function CircuitDiagram({
  payload,
  label,
  theme = "light",
}: {
  payload: QuantumCircuitPayload;
  label: string;
  theme?: CircuitSchematicTheme;
}) {
  const colors = THEME_COLORS[theme];
  const n = payload.num_qubits;
  const nextFree = new Array<number>(n).fill(0);
  const placed: { inst: QuantumCircuitInstruction; col: number }[] = [];
  const measures: number[] = [];
  for (const inst of payload.instructions) {
    if (inst.name === "measure") {
      measures.push(inst.qubits[0]);
      continue;
    }
    if (inst.name === "barrier") continue;
    const lo = Math.min(...inst.qubits);
    const hi = Math.max(...inst.qubits);
    let col = 0;
    for (let q = lo; q <= hi; q++) col = Math.max(col, nextFree[q]);
    for (let q = lo; q <= hi; q++) nextFree[q] = col + 1;
    placed.push({ inst, col });
  }
  const gateCols = Math.max(0, ...nextFree);
  const measureCol = gateCols + (measures.length > 0 ? 0.4 : 0);
  const cols = measureCol + (measures.length > 0 ? 1 : 0);
  const width = FIRST_COL + cols * COL_PITCH + 14;
  const height = TOP * 2 + (n - 1) * WIRE_GAP;
  const y = (q: number) => TOP + q * WIRE_GAP;
  const cx = (col: number) => FIRST_COL + col * COL_PITCH + BOX_W / 2;

  // Shrinks to fit the panel, but never below 80%: wider circuits (Grover)
  // scroll sideways instead of turning unreadable.
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block w-full"
        style={{ maxWidth: width, minWidth: Math.round(width * MIN_SCALE) }}
        role="img"
        aria-label={label}
      >
        {Array.from({ length: n }, (_, q) => (
          <g key={`wire-${q}`}>
            <line x1="36" y1={y(q)} x2={width - 8} y2={y(q)} stroke={colors.wire} strokeWidth="1.5" />
            <text x="4" y={y(q) + 5} fontSize="11" fontFamily="ui-monospace,monospace" fill={colors.label}>
              |0⟩
            </text>
          </g>
        ))}

        {placed.map(({ inst, col }, i) => {
          const x = cx(col);
          if (inst.name === "cx" || inst.name === "cz") {
            const [a, b] = inst.qubits;
            const tipB = inst.name === "cx" ? (b > a ? -10 : 10) : 0;
            return (
              <g key={i}>
                <line x1={x} y1={y(a)} x2={x} y2={y(b) + tipB} stroke={colors.connector} strokeWidth="1.5" />
                <circle cx={x} cy={y(a)} r="5" fill={colors.controlDot} />
                {inst.name === "cz" ? (
                  <circle cx={x} cy={y(b)} r="5" fill={colors.controlDot} />
                ) : (
                  <>
                    <circle cx={x} cy={y(b)} r="10" fill={colors.targetFill} stroke={colors.connector} strokeWidth="1.5" />
                    <line x1={x} y1={y(b) - 10} x2={x} y2={y(b) + 10} stroke={colors.connector} strokeWidth="1.5" />
                    <line x1={x - 10} y1={y(b)} x2={x + 10} y2={y(b)} stroke={colors.connector} strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }
          const text = GATE_TEXT[inst.name] ?? inst.name.toUpperCase();
          const q = inst.qubits[0];
          return (
            <g key={i}>
              <rect x={x - BOX_W / 2} y={y(q) - BOX_H / 2} width={BOX_W} height={BOX_H} rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
              <text
                x={x}
                y={y(q) + (text.length > 1 ? 4 : 5)}
                fontSize={text.length > 1 ? 10 : 13}
                fontFamily="ui-monospace,monospace"
                textAnchor="middle"
                fontWeight="700"
                fill={colors.gateLabel}
              >
                {text}
              </text>
            </g>
          );
        })}

        {measures.map((q) => {
          const x = cx(measureCol);
          return (
            <g key={`m-${q}`}>
              <rect x={x - BOX_W / 2} y={y(q) - BOX_H / 2} width={BOX_W} height={BOX_H} rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
              <path d={`M ${x - 8} ${y(q) + 6} Q ${x} ${y(q) - 6} ${x + 8} ${y(q) + 6}`} stroke={colors.meter} strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <line x1={x} y1={y(q)} x2={x + 6} y2={y(q) - 8} stroke={colors.meter} strokeWidth="1.5" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HGateCircuit({ colors }: { colors: Colors }) {
  return (
    <svg
      viewBox="0 0 200 64"
      className="w-full max-w-[200px]"
      aria-label="H gate circuit diagram"
    >
      {/* Qubit wire */}
      <line x1="36" y1="32" x2="182" y2="32" stroke={colors.wire} strokeWidth="1.5" />

      {/* |0⟩ label */}
      <text x="4" y="37" fontSize="11" fontFamily="ui-monospace,monospace" fill={colors.label}>
        |0⟩
      </text>

      {/* H gate box */}
      <rect x="62" y="19" width="30" height="26" rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
      <text
        x="77"
        y="36"
        fontSize="13"
        fontFamily="ui-monospace,monospace"
        textAnchor="middle"
        fontWeight="700"
        fill={colors.gateLabel}
      >
        H
      </text>

      {/* Measurement box */}
      <rect x="140" y="19" width="30" height="26" rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
      {/* Measurement arc */}
      <path d="M 147 38 Q 155 26 163 38" stroke={colors.meter} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Measurement arrow */}
      <line x1="155" y1="32" x2="161" y2="24" stroke={colors.meter} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BellCircuit({ colors }: { colors: Colors }) {
  return (
    <svg
      viewBox="0 0 240 114"
      className="w-full max-w-[240px]"
      aria-label="Bell state circuit diagram"
    >
      {/* Qubit wires */}
      <line x1="36" y1="36" x2="220" y2="36" stroke={colors.wire} strokeWidth="1.5" />
      <line x1="36" y1="86" x2="220" y2="86" stroke={colors.wire} strokeWidth="1.5" />

      {/* |0⟩ labels */}
      <text x="4" y="41" fontSize="11" fontFamily="ui-monospace,monospace" fill={colors.label}>
        |0⟩
      </text>
      <text x="4" y="91" fontSize="11" fontFamily="ui-monospace,monospace" fill={colors.label}>
        |0⟩
      </text>

      {/* H gate on top qubit */}
      <rect x="58" y="23" width="30" height="26" rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
      <text
        x="73"
        y="40"
        fontSize="13"
        fontFamily="ui-monospace,monospace"
        textAnchor="middle"
        fontWeight="700"
        fill={colors.gateLabel}
      >
        H
      </text>

      {/* CNOT: vertical connecting line (control bottom → target top) */}
      <line x1="138" y1="41" x2="138" y2="74" stroke={colors.connector} strokeWidth="1.5" />

      {/* CNOT: control dot */}
      <circle cx="138" cy="36" r="5" fill={colors.controlDot} />

      {/* CNOT: target circle (fill covers the line behind it) */}
      <circle cx="138" cy="86" r="12" fill={colors.targetFill} stroke={colors.connector} strokeWidth="1.5" />

      {/* CNOT: + symbol (vertical from top to bottom of target circle, horizontal across) */}
      <line x1="138" y1="74" x2="138" y2="98" stroke={colors.connector} strokeWidth="1.5" />
      <line x1="126" y1="86" x2="150" y2="86" stroke={colors.connector} strokeWidth="1.5" />

      {/* Measurement box, top qubit */}
      <rect x="178" y="23" width="30" height="26" rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
      <path d="M 185 42 Q 193 30 201 42" stroke={colors.meter} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <line x1="193" y1="36" x2="199" y2="28" stroke={colors.meter} strokeWidth="1.5" strokeLinecap="round" />

      {/* Measurement box, bottom qubit */}
      <rect x="178" y="73" width="30" height="26" rx="4" fill={colors.boxFill} stroke={colors.boxStroke} strokeWidth="1.5" />
      <path d="M 185 92 Q 193 80 201 92" stroke={colors.meter} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <line x1="193" y1="86" x2="199" y2="78" stroke={colors.meter} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
