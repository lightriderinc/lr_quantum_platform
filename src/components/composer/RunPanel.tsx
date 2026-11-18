"use client";

import { handleSignIn } from "@/app/actions/auth";
import BackendStatusBadge from "@/components/backends/BackendStatusBadge";
import CreditsSummary from "@/components/billing/CreditsSummary";
import JobResultView from "@/components/jobs/JobResultView";
import JobSubmitControls from "@/components/quantum/JobSubmitControls";
import ShotsInput from "@/components/quantum/ShotsInput";
import LRButton from "@/components/ui/LRButton";
import { useIonqBackends } from "@/hooks/useIonqBackends";
import { useIqmBackends } from "@/hooks/useIqmBackends";
import { useJobSubmission } from "@/hooks/useJobSubmission";
import { useRigettiBackends } from "@/hooks/useRigettiBackends";
import { BACKEND_TABS, backendTab, countByTab, type BackendTab } from "@/lib/backends/tabs";
import type { LrCircuitPayload } from "@/lib/composer/circuit";
import { getQuantumBackendId } from "@/lib/quantum/backends";
import type { Backend } from "@/types/backend";
import Link from "next/link";
import { useState } from "react";
import { MdArrowLeft } from "react-icons/md";

/**
 * Backends a job can be sent to (no "Coming soon" cards), from the same
 * hooks as the Backends page. Used by the run panel and by the composer (for
 * the qubit limit); React Query shares one fetch between them.
 */
export function useRunnableBackends() {
  const { data: iqm = [], isLoading: iqmLoading } = useIqmBackends();
  const { data: rigetti = [], isLoading: rigettiLoading } = useRigettiBackends();
  const { data: ionq = [], isLoading: ionqLoading } = useIonqBackends();
  return {
    runnable: [...iqm, ...rigetti, ...ionq].filter((b) => getQuantumBackendId(b.id) !== null),
    loading: iqmLoading || rigettiLoading || ionqLoading,
  };
}

// Run panel: pick a backend (QPUs / Simulators, as on the Backends page, with
// live status), set shots, and submit through the same flow as every other
// submit (useJobSubmission: credit gate, Forte "Get price" then confirm,
// server-side canUseIonqQpu). No backend is chosen to start with, so nothing
// can be sent until the user picks one and clicks the submit button.
export default function RunPanel({
  payload,
  isAuthenticated,
  blockers,
  onMeasureAll,
  selectedId,
  onSelect,
}: {
  payload: LrCircuitPayload;
  /** The chosen backend's catalog id, or null (nothing chosen yet). Owned by the composer, which limits qubits by it. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  isAuthenticated: boolean;
  /** Why this circuit can't run yet, per backend (empty when it can). */
  blockers: (backend: Backend) => string[];
  onMeasureAll: () => void;
}) {
  const { runnable, loading } = useRunnableBackends();
  const counts = countByTab(runnable);

  const [tab, setTab] = useState<BackendTab>("qpus");
  const [shots, setShots] = useState(1000);

  const selected = runnable.find((b) => b.id === selectedId) ?? null;
  // The hook needs some backend id; with nothing chosen it gets the free
  // ionq:mock as a placeholder, and the form below can't submit anyway.
  const quantumId = (selectedId && getQuantumBackendId(selectedId)) || "ionq-simulator";
  const submission = useJobSubmission({ backend: quantumId, circuit: payload, shots, gate: "composer" });
  const reasons = selected ? blockers(selected) : [];
  const needsMeasure = payload.instructions.length > 0 && !payload.instructions.some((i) => i.name === "measure");

  if (submission.displayedJob) {
    const ranOn = submission.displayedJob.backend;
    return (
      <Panel>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Result</h2>
        <p className="mb-4 text-xs text-gray-500">
          {runnable.find((b) => getQuantumBackendId(b.id) === ranOn)?.name ?? ranOn}
        </p>
        <JobResultView
          job={submission.displayedJob}
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <LRButton
                variant="secondary-outline"
                icon={<MdArrowLeft className="text-lg" />}
                iconPosition="left"
                onClick={submission.reset}
              >
                Back to run settings
              </LRButton>
              <Link href="/jobs" className="brand-link text-sm">
                View in Jobs
              </Link>
            </div>
          }
        />
      </Panel>
    );
  }

  const visible = runnable.filter((b) => backendTab(b) === tab);

  return (
    <Panel>
      <h2 className="block text-md font-semibold text-gray-400 mb-4">Run</h2>

      <div role="tablist" aria-label="Backend type" className="mb-3 flex gap-2 border-b border-gray-100">
        {BACKEND_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              tab === t.id
                ? "border-b-2 border-[var(--brand-primary)] text-[var(--brand-primary)]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {!loading && ` (${counts[t.id]})`}
          </button>
        ))}
      </div>

      <div className="mb-4 flex max-h-72 flex-col gap-1.5 overflow-y-auto" role="radiogroup" aria-label="Backend">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <span key={i} className="block h-12 animate-pulse default-radius bg-gray-100" />)
          : visible.map((b) => {
              const tooSmall = b.qubits < payload.num_qubits;
              const checked = b.id === selectedId;
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 default-radius border px-3 py-2 text-sm transition-colors ${
                    tooSmall ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-gray-300"
                  } ${checked ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5" : "border-gray-100 bg-white"}`}
                >
                  <input
                    type="radio"
                    name="composer-backend"
                    value={b.id}
                    checked={checked}
                    disabled={tooSmall}
                    onChange={() => onSelect(b.id)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{b.name}</span>
                    <span className="block text-xs text-gray-500">
                      {b.qubits} qubits{tooSmall ? `, too few for this circuit` : ""}
                    </span>
                  </span>
                  <BackendStatusBadge status={b.status} info={b.statusInfo} />
                </label>
              );
            })}
      </div>

      {!isAuthenticated ? (
        <p className="text-sm text-gray-600">
          <button type="button" onClick={() => handleSignIn()} className="brand-link cursor-pointer">
            Log in
          </button>{" "}
          to run this circuit.
        </p>
      ) : submission.stillCheckingCredits ? (
        <span className="block h-10 animate-pulse default-radius bg-gray-100" />
      ) : submission.blockedByCredits ? (
        <CreditsSummary />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected && reasons.length === 0) submission.submit();
          }}
        >
          <ShotsInput value={shots} onChange={setShots} onBlur={submission.checkShots} error={submission.shotsError} />

          {reasons.length > 0 && (
            <div className="default-radius border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-composer-blockers>
              <ul className="list-disc space-y-1 pl-4">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {needsMeasure && (
                <button type="button" onClick={onMeasureAll} className="brand-link mt-2 cursor-pointer text-sm">
                  Measure all qubits
                </button>
              )}
            </div>
          )}

          <JobSubmitControls submission={submission} />

          <LRButton
            variant="primary"
            type="submit"
            className="w-full"
            disabled={!selected || reasons.length > 0 || !submission.canSubmit}
          >
            {submission.submitLabel}
          </LRButton>
          {!selected && (
            <p className="text-center text-xs text-gray-500" data-composer-choose-backend>
              Choose a backend to run
            </p>
          )}
        </form>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="default-radius border border-gray-50 bg-gray-50 p-4" aria-label="Run">
      {children}
    </section>
  );
}
