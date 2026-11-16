"use client";

import { fetchJson, type Credits } from "@/components/billing/CreditsSummary";
import { isPaidBackend, isPricedPerJob, type QuantumBackendId } from "@/lib/quantum/backends";
import {
  fetchJobPrice,
  fetchQuantumJobDetail,
  PriceChangedError,
  PriceConfirmationRequiredError,
  submitQuantumJob,
  type JobPriceQuote,
  type QuantumCircuitPayload,
} from "@/lib/quantum/client";
import type { Job } from "@/types/job";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// The submit flow shared by BackendSubmitModal and the /composer run panel,
// so both charge, quote and gate exactly the same way:
//
//   - Paid backends check credits first: real QPU access needs an unlocked
//     account (a purchase, or credits received from another user), the same
//     rule the server applies (hasUnlockedCredits; canUseIonqQpu for Forte).
//   - Per-job priced backends (IonQ Forte) get a price first ("Get price"),
//     then the submit carries the confirmed price; the server re-quotes and
//     never charges more.
//   - A backend that's normally free but has a price right now (the IonQ
//     noisy simulator with IONQ_NOISY_SIM_PRICE_PER_SHOT_USD) answers the
//     first submit with a price to confirm; nothing is charged until then.
//
// A quote is for one exact backend, circuit and shot count. It's stored with
// that key and only used while the key still matches, so any edit drops it
// without an effect or an explicit reset.

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
  const quote = quoteState?.key === key ? quoteState.quote : null;
  const priceNotice = quoteState?.key === key ? quoteState.notice : null;
  const [submittedJob, setSubmittedJob] = useState<Job | null>(null);

  const { data: credits } = useQuery({
    queryKey: ["billing", "credits"],
    queryFn: () => fetchJson<Credits>("/api/billing/credits"),
    enabled: needsCredits,
  });
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
        setQuoteState((prev) =>
          prev?.key === vars.key
            ? { key: vars.key, quote: { ...prev.quote, priceCredits: err.priceCredits }, notice: err.message }
            : prev,
        );
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

  // JobResultView polls this same query key once it mounts (every 3 s until
  // terminal); subscribing here folds the persisted created_at and the
  // finished_at into the job it shows, computed at render time.
  const { data: submittedJobDetail } = useQuery({
    queryKey: ["lr-job-detail", submittedJob?.uuid],
    queryFn: () => fetchQuantumJobDetail(submittedJob!.uuid),
    enabled: !!submittedJob,
    retry: 0,
  });
  const displayedJob: Job | null = submittedJob
    ? {
        ...submittedJob,
        created_at: submittedJobDetail?.persistedCreatedAt ?? submittedJob.created_at,
        finished_at:
          submittedJob.finished_at ??
          (submittedJobDetail?.isInTerminalState ? submittedJobDetail.finishedAt : undefined),
      }
    : null;

  const balanceCredits = credits?.remainingCents ?? quote?.balanceCredits ?? null;
  const priceAboveBalance = !!quote && balanceCredits !== null && quote.priceCredits > balanceCredits;

  // Errors belong to the job they were about; an edit hides them.
  const quoteError = quoteMutation.variables?.key === key ? quoteMutation.error : null;
  const submitError = submitMutation.variables?.key === key ? submitMutation.error : null;

  /** The one button: get a price first when one is needed, otherwise submit (with the confirmed price, if any). Only ever called from a click. */
  function submit() {
    const vars: Vars = { key, backend, circuit, shots };
    if (pricedPerJob && !quote) {
      quoteMutation.mutate(vars);
      return;
    }
    if (quote && priceAboveBalance) return;
    submitMutation.mutate({ ...vars, confirmedPriceCredits: quote?.priceCredits });
  }

  /** Back to the form after a result. */
  function reset() {
    setSubmittedJob(null);
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
    quoteError,
    submitError,
    isQuoting,
    isSubmitting,
    canSubmit: !isSubmitting && !isQuoting && !(quote && priceAboveBalance),
    submitLabel:
      pricedPerJob && !quote
        ? isQuoting
          ? "Getting price…"
          : "Get price"
        : isSubmitting
          ? "Submitting…"
          : quote
            ? `Confirm and submit (${quote.priceCredits.toLocaleString()} credits)`
            : "Submit Job",
    submittedJob,
    displayedJob,
    submit,
    reset,
  };
}

export type JobSubmission = ReturnType<typeof useJobSubmission>;
