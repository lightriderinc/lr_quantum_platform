"use client";

import { PREVIEW_MAX_QUBITS } from "@/lib/composer/circuit";
import {
  CHART_TOP_OUTCOMES,
  chartAxisMax,
  probabilityChartData,
  type ProbabilityPreview,
} from "@/lib/composer/statevector";

const CHART_HEIGHT = 200;

const fmtPct = (p: number) => {
  const pct = p * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  return `${Number(pct.toFixed(pct < 10 ? 1 : 0))}%`;
};

// Outcome probabilities from the in-browser simulation as a vertical bar
// chart, like qBraid's: every basis state on the x axis up to 5 bits (zeros
// included, so you can see what can't happen), otherwise the 16 most likely
// outcomes. Bars use the same blue as the job results.
export default function ProbabilityPanel({
  preview,
  bits,
  measuredMidCircuit,
}: {
  /** Null above PREVIEW_MAX_QUBITS: the chart is replaced by a note. */
  preview: ProbabilityPreview | null;
  /** Length of each outcome's bitstring (the circuit's qubit count). */
  bits: number;
  /** Qubits with a gate after their measurement: the preview treats every measurement as final. */
  measuredMidCircuit: number[];
}) {
  return (
    <section className="default-radius border border-gray-100 bg-gray-50 p-4" aria-label="Probabilities">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="text-base font-semibold text-gray-900">Probabilities</h2>
        <span className="text-xs text-gray-500">Ideal simulation, no noise</span>
      </div>
      {preview ? (
        <Chart preview={preview} bits={bits} measuredMidCircuit={measuredMidCircuit} />
      ) : (
        <p className="py-10 text-center text-sm text-gray-500" data-preview-limit>
          Preview is available up to {PREVIEW_MAX_QUBITS} qubits. Run the circuit to see results.
        </p>
      )}
    </section>
  );
}

function Chart({
  preview,
  bits,
  measuredMidCircuit,
}: {
  preview: ProbabilityPreview;
  bits: number;
  measuredMidCircuit: number[];
}) {
  const data = probabilityChartData(preview, bits);
  const axisMax = chartAxisMax(Math.max(0, ...data.bars.map((b) => b.probability)));
  const showValues = data.bars.length <= 16;
  const verticalLabels = bits >= 3;

  return (
    <>
      <p className="mb-3 text-xs text-gray-500">
        {preview.basis === "all"
          ? "No measurements yet. Showing every qubit."
          : "Outcomes of the measured bits, highest bit on the left."}
        {data.mode === "top" &&
          data.nonZero > data.bars.length &&
          ` Showing the ${CHART_TOP_OUTCOMES} most likely of ${data.nonZero.toLocaleString()} outcomes.`}
      </p>
      {measuredMidCircuit.length > 0 && (
        <p className="mb-3 text-xs text-amber-700">
          Qubit {measuredMidCircuit.join(", ")} has gates after its measurement. The preview treats every measurement as final.
        </p>
      )}

      <div className="flex gap-2" role="img" aria-label="Outcome probabilities">
        {/* y axis */}
        <div className="relative w-10 shrink-0 text-right text-[10px] text-gray-500 tabular-nums" style={{ height: CHART_HEIGHT }}>
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute right-1 -translate-y-1/2" style={{ top: (1 - f) * CHART_HEIGHT }}>
              {fmtPct(axisMax * f)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-full" style={{ width: Math.max(data.bars.length * 22, 0) }}>
            {/* plot */}
            <div className="relative border-b border-l border-gray-300" style={{ height: CHART_HEIGHT }}>
              {[0.5, 1].map((f) => (
                <span key={f} className="absolute inset-x-0 border-t border-dashed border-gray-200" style={{ top: (1 - f) * CHART_HEIGHT }} />
              ))}
              <div className="absolute inset-0 flex items-end justify-around gap-1 px-1">
                {data.bars.map(({ outcome, probability }) => {
                  const h = axisMax > 0 ? (probability / axisMax) * CHART_HEIGHT : 0;
                  return (
                    <div
                      key={outcome}
                      className="relative flex h-full max-w-14 min-w-3 flex-1 flex-col items-center justify-end"
                      title={`|${outcome}⟩ ${fmtPct(probability)}`}
                    >
                      {showValues && probability > 0 && (
                        <span className="mb-0.5 text-[10px] text-gray-600 tabular-nums">{fmtPct(probability)}</span>
                      )}
                      <div className="w-full rounded-t bg-blue-500 transition-all duration-300" style={{ height: h }} />
                    </div>
                  );
                })}
              </div>
            </div>
            {/* x axis */}
            <div className="flex justify-around gap-1 px-1 pt-1">
              {data.bars.map(({ outcome }) => (
                <span
                  key={outcome}
                  className="flex max-w-14 min-w-3 flex-1 justify-center font-mono text-[10px] text-gray-600"
                  style={verticalLabels ? { writingMode: "vertical-rl", transform: "rotate(180deg)" } : undefined}
                >
                  {outcome}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
