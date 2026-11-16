"use client";

import CreditsSummary from "@/components/billing/CreditsSummary";
import JobResultView from "@/components/jobs/JobResultView";
import CircuitSchematic, {
  type CircuitType,
} from "@/components/quantum/CircuitSchematic";
import JobSubmitControls from "@/components/quantum/JobSubmitControls";
import ShotsInput from "@/components/quantum/ShotsInput";
import LRButton from "@/components/ui/LRButton";
import { useJobSubmission } from "@/hooks/useJobSubmission";
import type { QuantumBackendId } from "@/lib/quantum/backends";
import { CIRCUIT_PAYLOADS } from "@/lib/quantum/client";
import { useEffect, useState } from "react";
import { MdArrowLeft, MdClose } from "react-icons/md";

const CIRCUITS: { value: CircuitType; label: string; description: string }[] = [
  { value: "h", label: "H gate", description: "1-qubit superposition" },
  { value: "bell", label: "Bell state", description: "2-qubit entangled pair" },
];

function toCircuitType(gate: string | undefined): CircuitType | null {
  if (gate === "h" || gate === "bell") return gate;
  return null;
}

/**
 * Shared circuit-submission modal — the form/schematic/result logic
 * DemoCircuitModal originally built, generalized to take any backend instead
 * of a hardcoded one. Used by:
 *   - the Dashboard's "Submit sample circuits" tile (backend="iqm-garnet-mock")
 *   - the /backends catalog's "Submit a job" button on each of the 6 IQM cards
 *   - (via NewJobModal) the Jobs page's real-hardware submission form
 *
 * The credit gate only applies when the backend actually costs something —
 * mock backends (costPerShotCents: 0) skip the /api/billing/credits fetch
 * entirely rather than gating on a balance that's never checked server-side.
 * The credit, price and submit logic lives in useJobSubmission, shared with
 * the /composer run panel.
 */
export default function BackendSubmitModal({
  backend,
  title = "Submit Sample Circuit",
  initialCircuit = "h",
  successMessage,
  onClose,
}: {
  backend: QuantumBackendId;
  title?: string;
  initialCircuit?: CircuitType;
  /** Extra content shown above the result once the job has been submitted — e.g. course-specific next steps. */
  successMessage?: React.ReactNode;
  onClose: () => void;
}) {
  const [circuit, setCircuit] = useState<CircuitType>(initialCircuit);
  const [shots, setShots] = useState(1000);
  const submission = useJobSubmission({
    backend,
    circuit: CIRCUIT_PAYLOADS[circuit],
    shots,
    gate: circuit,
  });
  const { blockedByCredits, stillCheckingCredits, submittedJob, displayedJob } = submission;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submission.submit();
  }

  const activeCircuit: CircuitType =
    (submittedJob && toCircuitType(submittedJob.gate)) ?? circuit;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col default-radius bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-8 pb-5 pt-8 pr-16">
          <h2 className="text-lg font-semibold">
            {submittedJob ? "Job Result" : title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-lg text-gray-500 hover:text-gray-700"
          >
            <MdClose />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 pb-8">
          <div
            className={
              blockedByCredits
                ? "grid grid-cols-1"
                : "grid grid-cols-1 gap-8 md:grid-cols-[1fr_220px]"
            }
          >
            {/* Left: form or results */}
            <div className="min-w-0">
              {displayedJob ? (
                <div className="flex flex-col gap-5">
                  {successMessage}
                  <JobResultView
                    job={displayedJob}
                    footer={
                      <LRButton
                        variant="secondary-outline"
                        icon={<MdArrowLeft className="text-lg" />}
                        iconPosition="left"
                        onClick={submission.reset}
                        className="mt-1 w-fit"
                      >
                        Try Another
                      </LRButton>
                    }
                  />
                </div>
              ) : stillCheckingCredits ? null : blockedByCredits ? (
                <CreditsSummary />
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Circuit
                    </label>
                    <select
                      value={circuit}
                      onChange={(e) => setCircuit(e.target.value as CircuitType)}
                      className="default-radius w-full border border-gray-100 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      {CIRCUITS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label} — {c.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <ShotsInput value={shots} onChange={setShots} />

                  <JobSubmitControls submission={submission} />

                  <div className="flex justify-end gap-3 pt-1">
                    <LRButton variant="secondary-outline" onClick={onClose}>
                      Cancel
                    </LRButton>
                    <LRButton
                      variant="primary"
                      type="submit"
                      disabled={!submission.canSubmit}
                    >
                      {submission.submitLabel}
                    </LRButton>
                  </div>
                </form>
              )}
            </div>

            {/* Right: circuit schematic (persists across both views, hidden when blocked by credits) */}
            {!blockedByCredits && (
              <div>
                <CircuitSchematic circuit={activeCircuit} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
