"use client";

import { fetchJson, type Credits } from "@/components/billing/CreditsSummary";
import { fetchJobs } from "@/components/jobs/JobsList";
import {
  isPaidBackend,
  isPricedPerJob,
  isPricedPerShot,
  perShotPriceCredits,
  qubitLimitError,
  shotsLimitError,
  type QuantumBackendId,
} from "@/lib/quantum/backends";
import {
  fetchJobPrice,
  fetchQuantumJobDetail,
  PriceChangedError,
  PriceConfirmationRequiredError,
  submitQuantumJob,
  type JobPriceQuote,
  type QuantumCircuitPayload,
} from "@/lib/quantum/client";
import { TERMINAL_JOB_STATUSES as TERMINAL, type Job } from "@/types/job";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

// The submit flow shared by BackendSubmitModal and the /composer run panel,
// so both charge, quote and gate exactly the same way:
//
//   - Paid backends check credits first: real QPU access needs an unlocked
//     account (a purchase, or credits received from another user), the same
//     rule the server applies (hasUnlockedCredits; canUseIonqQpu for Forte).
//   - Per-job priced backends (IonQ Forte) get a price first ("Get price"),
//     then the submit carries the confirmed price; the server re-quotes and
//     never charges more.
//   - Per-shot paid backends (IQM, Rigetti) submit in one click, with the
//     price on the button ("Submit Job (N credits)"): shots times the rate,
//     the same function the server charges with.
//   - A backend that's normally free but has a price right now (the IonQ
//     noisy simulator with IONQ_NOISY_SIM_PRICE_PER_SHOT_USD) answers the
//     first submit with a price to confirm; nothing is charged until then.
//
// A quote is for one exact backend, circuit and shot count. It's stored with
// that key and only used while the key still matches, so any edit drops it
// without an effect or an explicit reset.

/** Detail fetches after COMPLETED while the finish time is still missing (3 s apart, so about a minute). */
const FINISH_TIME_POLLS = 20;

interface Vars {
  key: string;
  backend: QuantumBackendId;
  circuit: QuantumCircuitPayload;
  shots: number;
  confirmedPriceCredits?: number;
}

export interface JobSubmissionOptions {
  backend: QuantumBackendId;
  circuit: QuantumCircuitPayload;
  shots: number;
  /** Stored on the job shown afterwards (JobResultView's `gate`), e.g. "bell" or "composer". */
  gate: string;
}

export function useJobSubmission({ backend, circuit, shots, gate }: JobSubmissionOptions) {
  const queryClient = useQueryClient();
  const key = JSON.stringify([backend, circuit, shots]);
  const needsCredits = isPaidBackend(backend);
  const pricedPerJob = isPricedPerJob(backend);

  const [quoteState, setQuoteState] = useState<{ key: string; quote: JobPriceQuote; notice: string | null } | null>(null);
  const pricedPerShot = isPricedPerShot(backend);
  // Same checks and messages as the submit route: too many qubits for this
  // backend, or shots out of range. Either one disables submit. The shot
  // count isn't judged while it's being typed: its message shows (and submit
  // is disabled) once the box loses focus or a submit is tried, for that
  // exact value. Typing again hides it until the next check.
  const qubitError = qubitLimitError(backend, circuit.num_qubits);
  const shotsProblem = shotsLimitError(backend, shots);
  const [checkedShots, setCheckedShots] = useState<number | null>(null);
  const shotsError = Object.is(checkedShots, shots) ? shotsProblem : null;
  const invalidJob = qubitError !== null || shotsProblem !== null;
  const priceNotice = quoteState?.key === key ? quoteState.notice : null;
  const [submittedJob, setSubmittedJob] = useState<Job | null>(null);

  const { data: credits } = useQuery({
    queryKey: ["billing", "credits"],
    queryFn: () => fetchJson<Credits>("/api/billing/credits"),
    enabled: needsCredits,
  });
  // Per-shot price, known without asking the server; shown on the button.
  const perShotPrice = pricedPerShot && Number.isInteger(shots) && shots > 0 ? perShotPriceCredits(backend, shots) : null;
  const quote = quoteState?.key === key ? quoteState.quote : null;
  const blockedByCredits =
    needsCredits && credits !== undefined && (!credits.hasUnlocked || credits.remainingCents <= 0);
  const stillCheckingCredits = needsCredits && credits === undefined;

  const submitMutation = useMutation({
    mutationFn: async (vars: Vars) => {
      const submitTime = new Date().toISOString();
      const job = await submitQuantumJob(vars.backend, vars.circuit, vars.shots, vars.confirmedPriceCredits);
      return { job, submitTime };
    },
    onError: (err, vars) => {
      // The server re-quoted higher than what was confirmed: show the new
      // price and ask again. Nothing was charged or sent.
      if (err instanceof PriceChangedError) {
        setQuoteState((prev) => ({
          key: vars.key,
          quote: {
            ...(prev?.key === vars.key ? prev.quote : { balanceCredits: credits?.remainingCents ?? 0 }),
            priceCredits: err.priceCredits,
          },
          notice: err.message,
        }));
        submitMutation.reset();
      }
      if (err instanceof PriceConfirmationRequiredError) {
        setQuoteState({
          key: vars.key,
          quote: { priceCredits: err.priceCredits, balanceCredits: err.balanceCredits ?? credits?.remainingCents ?? 0 },
          notice: "This job has a price. Review it and confirm to submit.",
        });
        submitMutation.reset();
      }
    },
    onSuccess: ({ job, submitTime }, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lr-jobs-list"] });
      setSubmittedJob({
        ...job,
        status: job.status ?? "PENDING",
        created_at: submitTime,
        gate,
        backend: vars.backend,
        shots: vars.shots,
      });
    },
  });

  const quoteMutation = useMutation({
    mutationFn: (vars: Vars) => fetchJobPrice(vars.backend, vars.circuit, vars.shots),
    onSuccess: (q, vars) => setQuoteState({ key: vars.key, quote: q, notice: null }),
  });

  // Times come from the same place as the Jobs page: our own job row
  // (GET /api/lr/quantum/jobs), whose finishedAt is back-filled by a live
  // detail fetch (jobs/[id]/route.ts). Some backends (seen on Rigetti) report
  // COMPLETED before they report a finish time, and JobResultView stops
  // polling at COMPLETED, so this keeps fetching the detail (same query key)
  // until the finish time is known, up to a limit, then refreshes the row.
  // Update count when the detail first came back terminal (set in the query's callback, not in render).
  const terminalSince = useRef<number | null>(null);
  const { data: submittedJobDetail } = useQuery({
    queryKey: ["lr-job-detail", submittedJob?.uuid],
    queryFn: () => fetchQuantumJobDetail(submittedJob!.uuid),
    enabled: !!submittedJob,
    retry: 0,
    refetchInterval: (query) => {
      const d = query.state.data;
      const terminal = d && (d.isInTerminalState || TERMINAL.has(d.status));
      if (!terminal) return 3000;
      if (d.finishedAt) return false;
      terminalSince.current ??= query.state.dataUpdateCount;
      return query.state.dataUpdateCount - terminalSince.current >= FINISH_TIME_POLLS ? false : 3000;
    },
  });
  const detailTerminal =
    !!submittedJobDetail && (submittedJobDetail.isInTerminalState || TERMINAL.has(submittedJobDetail.status));
  const detailFinishedAt = submittedJobDetail?.finishedAt;
  const { data: jobRows } = useQuery({
    queryKey: ["lr-jobs-list"],
    queryFn: fetchJobs,
    enabled: !!submittedJob,
  });
  // The row only learns the finish time from a detail fetch: refresh it then.
  useEffect(() => {
    if (detailTerminal) queryClient.invalidateQueries({ queryKey: ["lr-jobs-list"] });
  }, [detailTerminal, detailFinishedAt, queryClient]);
  const row = submittedJob ? jobRows?.find((j) => j.jobId === submittedJob.uuid) : undefined;
  const displayedJob: Job | null = submittedJob
    ? {
        ...submittedJob,
        created_at: row?.createdAt ?? submittedJobDetail?.persistedCreatedAt ?? submittedJob.created_at,
        finished_at:
          row?.finishedAt ??
          submittedJob.finished_at ??
          (detailTerminal ? detailFinishedAt : undefined),
      }
    : null;

  const balanceCredits = credits?.remainingCents ?? quote?.balanceCredits ?? null;
  // The price this job will be charged: a confirmed quote, or the per-shot price.
  const priceCredits = quote?.priceCredits ?? perShotPrice;
  const priceAboveBalance = priceCredits !== null && balanceCredits !== null && priceCredits > balanceCredits;

  // Errors belong to the job they were about; an edit hides them.
  const quoteError = quoteMutation.variables?.key === key ? quoteMutation.error : null;
  const submitError = submitMutation.variables?.key === key ? submitMutation.error : null;

  /** The one button: get a price first when one is needed, otherwise submit (with the confirmed price, if any). Only ever called from a click. */
  function submit() {
    setCheckedShots(shots);
    if (invalidJob) return;
    const vars: Vars = { key, backend, circuit, shots };
    if (pricedPerJob && !quote) {
      quoteMutation.mutate(vars);
      return;
    }
    if (priceAboveBalance) return;
    submitMutation.mutate({ ...vars, confirmedPriceCredits: quote?.priceCredits });
  }

  /** Back to the form after a result. */
  function reset() {
    setSubmittedJob(null);
    terminalSince.current = null;
    submitMutation.reset();
  }

  const isQuoting = quoteMutation.isPending;
  const isSubmitting = submitMutation.isPending;

  return {
    needsCredits,
    pricedPerJob,
    credits,
    blockedByCredits,
    stillCheckingCredits,
    quote,
    priceNotice,
    balanceCredits,
    priceAboveBalance,
    /** Per-shot paid backends (IQM, Rigetti): the price shown on the button; null otherwise. */
    perShotPrice,
    /** "This circuit has N qubits. X supports up to M." when the circuit doesn't fit the backend. */
    qubitError,
    /** "Max N shots on X" (or "At least 1 shot") once an out-of-range shot count has been checked (blur or submit); shown by ShotsInput. */
    shotsError,
    /** ShotsInput's onBlur: check the shot count now. */
    checkShots: () => setCheckedShots(shots),
    /** The price this job will be charged, when known: a confirmed quote or the per-shot price. */
    priceCredits,
    quoteError,
    submitError,
    isQuoting,
    isSubmitting,
    // A bad shot count only disables the button once its message shows, so
    // clicking (or Enter) with an unchecked value still runs the check.
    canSubmit: !isSubmitting && !isQuoting && !priceAboveBalance && !qubitError && !shotsError,
    submitLabel:
      pricedPerJob && !quote
        ? isQuoting
          ? "Getting price…"
          : "Get price"
        : isSubmitting
          ? "Submitting…"
          : quote
            ? `Confirm and submit (${quote.priceCredits.toLocaleString()} credits)`
            : perShotPrice !== null
              ? `Submit Job (${perShotPrice.toLocaleString()} credits)`
              : "Submit Job",
    submittedJob,
    displayedJob,
    submit,
    reset,
  };
}

export type JobSubmission = ReturnType<typeof useJobSubmission>;
