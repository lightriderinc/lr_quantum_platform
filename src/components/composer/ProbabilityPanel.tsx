"use client";

import { PREVIEW_MAX_QUBITS } from "@/lib/composer/circuit";
import type { ProbabilityPreview } from "@/lib/composer/statevector";

const MAX_BARS = 16;

// Outcome probabilities from the in-browser simulation, drawn like the
// measurement results on a finished job (JobResultView) so the two compare
// at a glance.
export default function ProbabilityPanel({
  preview,
  measuredMidCircuit,
}: {
  /** Null above PREVIEW_MAX_QUBITS: the chart is replaced by a note. */
  preview: ProbabilityPreview | null;
  /** Qubits with a gate after their measurement: the preview treats every measurement as final. */
  measuredMidCircuit: number[];
}) {
  if (!preview) {
    return (
      <section className="flex min-w-0 flex-col default-radius border border-gray-100 bg-gray-50 p-4" aria-label="Probabilities">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Probabilities</h2>
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-gray-500" data-preview-limit>
          Preview is available up to {PREVIEW_MAX_QUBITS} qubits. Run the circuit to see results.
        </p>
      </section>
    );
  }

  const shown = preview.outcomes.slice(0, MAX_BARS);
  const hidden = preview.outcomes.length - shown.length;

  return (
    <section className="flex min-w-0 flex-col default-radius border border-gray-100 bg-gray-50 p-4" aria-label="Probabilities">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Probabilities</h2>
        <span className="text-xs text-gray-500">Ideal simulation, no noise</span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        {preview.basis === "all"
          ? "No measurements yet, so this shows every qubit."
          : "Outcomes of the measured bits, highest bit on the left."}
      </p>
      {measuredMidCircuit.length > 0 && (
        <p className="mb-3 text-xs text-amber-700">
          Qubit {measuredMidCircuit.join(", ")} has gates after its measurement. The preview treats every measurement as if it
          came last.
        </p>
      )}
      <div className="space-y-2">
        {shown.map(({ outcome, probability }) => {
          const pct = probability * 100;
          return (
            <div key={outcome} className="flex items-center gap-3">
              <span className="min-w-10 shrink-0 whitespace-nowrap font-mono text-sm text-gray-700">|{outcome}⟩</span>
              <div className="flex-1 overflow-hidden rounded bg-gray-200/70">
                <div className="h-4 rounded bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right text-xs text-gray-500 tabular-nums">
                {pct >= 0.1 || pct === 0 ? pct.toFixed(1) : "<0.1"}%
              </span>
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Showing the {MAX_BARS} most likely of {preview.outcomes.length.toLocaleString()} outcomes.
        </p>
      )}
    </section>
  );
}
