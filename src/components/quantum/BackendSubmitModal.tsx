"use client";

import CreditsSummary from "@/components/billing/CreditsSummary";
import JobResultView from "@/components/jobs/JobResultView";
import { TemplateSchematic } from "@/components/quantum/CircuitSchematic";
import JobSubmitControls from "@/components/quantum/JobSubmitControls";
import ShotsInput from "@/components/quantum/ShotsInput";
import LRButton from "@/components/ui/LRButton";
import { useJobSubmission } from "@/hooks/useJobSubmission";
import {
  CIRCUIT_SECTIONS,
  circuitTemplate,
  composerHref,
  templatesForQubits,
  type BuiltCircuit,
  type CircuitTemplateId,
} from "@/lib/circuits/templates";
import { QUANTUM_BACKENDS, type QuantumBackendId } from "@/lib/quantum/backends";
import { useEffect, useState } from "react";
import { MdArrowLeft, MdClose } from "react-icons/md";

interface Selection {
  id: CircuitTemplateId;
  built: BuiltCircuit;
}

/** Builds the template afresh, so random circuits get new angles each time they're picked. */
function select(id: CircuitTemplateId): Selection {
  return { id, built: circuitTemplate(id).build() };
}

/**
 * The one submit popup: every "submit a circuit" entry opens this, with the
 * shared circuit list (lib/circuits/templates.ts), grouped by section, with
 * circuits wider than the backend hidden. Used by:
 *   - the Dashboard's "Submit sample circuits" tile (backend="iqm-garnet-mock")
 *   - every /backends card's "Submit a sample circuit" (BackendModal), with
 *     that card's backend, and the Cepheus page's Connection tab
 *   - the dashboard and /reservations reservation rows
 *   - (via NewJobModal) the Jobs page's real-hardware submission form
 *   - the classroom's "Run on simulator" buttons
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
  initialCircuit?: CircuitTemplateId;
  /** Extra content shown above the result once the job has been submitted — e.g. course-specific next steps. */
  successMessage?: React.ReactNode;
  onClose: () => void;
}) {
  // Only circuits that fit on this backend.
  const templates = templatesForQubits(QUANTUM_BACKENDS[backend].maxQubits);
  const [selection, setSelection] = useState<Selection>(() =>
    select(templates.some((t) => t.id === initialCircuit) ? initialCircuit : templates[0].id),
  );
  const [shots, setShots] = useState(1000);
  const submission = useJobSubmission({
    backend,
    circuit: selection.built.payload,
    shots,
    gate: selection.id,
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
                    <label htmlFor="submit-circuit" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Circuit
                    </label>
                    <select
                      id="submit-circuit"
                      value={selection.id}
                      onChange={(e) => setSelection(select(e.target.value as CircuitTemplateId))}
                      className="default-radius w-full border border-gray-100 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      {CIRCUIT_SECTIONS.map((section) => {
                        const inSection = templates.filter((t) => t.section === section);
                        if (inSection.length === 0) return null;
                        return (
                          <optgroup key={section} label={section}>
                            {inSection.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}: {t.description}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  <ShotsInput value={shots} onChange={setShots} error={submission.shotsError} />

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
                <TemplateSchematic
                  template={circuitTemplate(selection.id)}
                  built={selection.built}
                  onNewAngles={() => setSelection(select(selection.id))}
                  composerHref={composerHref(selection.id, selection.built)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
