"use client";

import { handleSignIn } from "@/app/actions/auth";
import BackendAvailabilityBadge from "@/components/backends/BackendAvailabilityBadge";
import CreditsSummary from "@/components/billing/CreditsSummary";
import type { CompareRun } from "@/components/composer/CompareResults";
import CompareRunForm from "@/components/composer/CompareRunForm";
import JobResultView from "@/components/jobs/JobResultView";
import JobSubmitControls from "@/components/quantum/JobSubmitControls";
import ShotsInput from "@/components/quantum/ShotsInput";
import LRButton from "@/components/ui/LRButton";
import { useJobSubmission } from "@/hooks/useJobSubmission";
import { useRunnableBackends } from "@/hooks/useRunnableBackends";
import { backendCondition } from "@/lib/backends/availability";
import { BACKEND_TABS, backendTab, countByTab, type BackendTab } from "@/lib/backends/tabs";
import type { LrCircuitPayload } from "@/lib/composer/circuit";
import { COMPARE_MAX, type Distribution } from "@/lib/composer/compare";
import { getQuantumBackendId, type QuantumBackendId } from "@/lib/quantum/backends";
import type { Backend } from "@/types/backend";
import Link from "next/link";
import { useState } from "react";
import { MdArrowLeft } from "react-icons/md";

// Run panel: pick a backend (QPUs / Simulators, as on the Backends page, with
// live status), set shots, and submit through the same flow as every other
// submit (useJobSubmission: credit gate, Forte "Get price" then confirm,
// server-side canUseIonqQpu). No backend is chosen to start with, so nothing
// can be sent until the user picks one and clicks the submit button. Offline
// or Unavailable backends are greyed out and can't be picked; the composer
// clears the choice if the picked one goes unavailable.
//
// Compare mode: the list becomes checkboxes (2 to 4 backends, same greying
// out), and CompareRunForm runs the circuit on all of them at once; the
// composer shows the results (CompareResults).
export type RunMode = "single" | "compare";

export default function RunPanel({
  payload,
  templateName,
  isAuthenticated,
  blockers,
  onMeasureAll,
  selectedId,
  onSelect,
  mode,
  onModeChange,
  ideal,
  onCompareRun,
}: {
  payload: LrCircuitPayload;
  /** The template the circuit still matches unedited, stored with the job; null otherwise. */
  templateName: string | null;
  /** The chosen backend's catalog id, or null (nothing chosen yet). Owned by the composer, which limits qubits by it. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  isAuthenticated: boolean;
  /** Why this circuit can't run yet, per backend (empty when it can). */
  blockers: (backend: Backend) => string[];
  onMeasureAll: () => void;
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  /** The circuit's ideal distribution (in-browser statevector), or null above the preview limit. */
  ideal: Distribution | null;
  onCompareRun: (run: CompareRun) => void;
}) {
  const { runnable, loading } = useRunnableBackends();
  const counts = countByTab(runnable);

  const [tab, setTab] = useState<BackendTab>("qpus");
  const [shots, setShots] = useState(1000);

  const selected = runnable.find((b) => b.id === selectedId) ?? null;
  // The hook needs some backend id; with nothing chosen it gets the free
  // ionq:mock as a placeholder, and the form below can't submit anyway.
  const quantumId = (selectedId && getQuantumBackendId(selectedId)) || "ionq-simulator";
  const submission = useJobSubmission({ backend: quantumId, circuit: payload, shots, gate: "composer", templateName });
  const reasons = selected ? blockers(selected) : [];
  const needsMeasure = payload.instructions.length > 0 && !payload.instructions.some((i) => i.name === "measure");

  // Compare: the checked backends, in list order. One that went unavailable
  // or became too small for the circuit simply stops counting.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const isDisabled = (b: Backend) => b.qubits < payload.num_qubits || backendCondition(b).blocked;
  const compareBackends = runnable.filter((b) => compareIds.includes(b.id) && !isDisabled(b));
  const compareSelection = compareBackends.flatMap((b) => {
    const backend = getQuantumBackendId(b.id);
    return backend ? [{ backend: backend as QuantumBackendId, name: b.name }] : [];
  });
  const compareReasons = [...new Set(compareBackends.flatMap(blockers))];
  const compareFull = compareBackends.length >= COMPARE_MAX;

  if (mode === "single" && submission.displayedJob) {
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="block text-md font-semibold text-gray-400">Run</h2>
        <div className="inline-flex default-radius border border-gray-200 bg-white p-0.5 text-sm" role="group" aria-label="Run mode">
          {(["single", "compare"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={`cursor-pointer default-radius px-2.5 py-1 transition-colors ${
                mode === m ? "bg-[var(--brand-primary)] text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {m === "single" ? "Single" : "Compare"}
            </button>
          ))}
        </div>
      </div>

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

      <div
        className="mb-4 flex max-h-72 flex-col gap-1.5 overflow-y-auto"
        role={mode === "single" ? "radiogroup" : "group"}
        aria-label={mode === "single" ? "Backend" : "Backends to compare"}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <span key={i} className="block h-12 animate-pulse default-radius bg-gray-100" />)
          : visible.map((b) => {
              const tooSmall = b.qubits < payload.num_qubits;
              const compare = mode === "compare";
              const checked = compare ? compareBackends.some((c) => c.id === b.id) : b.id === selectedId;
              // Compare: a fifth can't be checked until one is unchecked.
              const disabled = isDisabled(b) || (compare && compareFull && !checked);
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 default-radius border px-3 py-2 text-sm transition-colors ${
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-gray-300"
                  } ${checked ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5" : "border-gray-100 bg-white"}`}
                >
                  <input
                    type={compare ? "checkbox" : "radio"}
                    name={compare ? "composer-compare" : "composer-backend"}
                    value={b.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      compare
                        ? setCompareIds(checked ? compareIds.filter((id) => id !== b.id) : [...compareIds.filter((id) => compareBackends.some((c) => c.id === id)), b.id])
                        : onSelect(b.id)
                    }
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{b.name}</span>
                    <span className="block text-xs text-gray-500">
                      {b.qubits} qubits{tooSmall ? `, too few for this circuit` : ""}
                    </span>
                  </span>
                  <BackendAvailabilityBadge backend={b} plain />
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
      ) : mode === "compare" ? (
        <CompareRunForm
          selection={compareSelection}
          payload={payload}
          templateName={templateName}
          reasons={compareReasons}
          ideal={ideal}
          onRun={onCompareRun}
        />
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
