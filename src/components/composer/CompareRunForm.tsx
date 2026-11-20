"use client";

import CreditsSummary, { fetchJson, type Credits } from "@/components/billing/CreditsSummary";
import type { CompareRun } from "@/components/composer/CompareResults";
import ShotsInput from "@/components/quantum/ShotsInput";
import LRButton from "@/components/ui/LRButton";
import { COMPARE_MAX, COMPARE_MIN, compareButtonLabel, comparePrice, submitCompare, type Distribution } from "@/lib/composer/compare";
import type { LrCircuitPayload } from "@/lib/composer/circuit";
import { isPaidBackend, shotsLimitError, type QuantumBackendId } from "@/lib/quantum/backends";
import { fetchJobPrice, submitQuantumJob } from "@/lib/quantum/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// Compare mode's form: shots for every backend, the price of each and one
// total, and a single run button. Pricing is the single run's
// (useJobSubmission): per-shot QPUs show their price, Forte needs "Get price"
// (and the noisy simulator is quoted too, free unless priced), anything paid
// needs one "Confirm and run (N credits)", and the total must fit the
// balance. Each job then goes through the same submit route, in parallel,
// with its confirmed price.
export default function CompareRunForm({
  selection,
  payload,
  templateName,
  reasons,
  ideal,
  onRun,
}: {
  /** The checked backends that can run (2 to 4 to submit). */
  selection: { backend: QuantumBackendId; name: string }[];
  payload: LrCircuitPayload;
  templateName: string | null;
  /** Why this circuit can't run on the checked backends yet. */
  reasons: string[];
  /** The ideal distribution of the circuit now, or null above the preview limit. */
  ideal: Distribution | null;
  onRun: (run: CompareRun) => void;
}) {
  const queryClient = useQueryClient();
  const [shots, setShots] = useState(1000);
  const [checkedShots, setCheckedShots] = useState<number | null>(null);
  const backends = selection.map((s) => s.backend);
  const shotsProblem = backends.map((b) => shotsLimitError(b, shots)).find((e) => e !== null) ?? null;
  const shotsError = Object.is(checkedShots, shots) ? shotsProblem : null;

  // Quotes hold for this exact circuit and shot count; adding or removing a
  // backend keeps the others' quotes.
  const quoteKey = JSON.stringify([shots, payload]);
  const [quoteState, setQuoteState] = useState<{ key: string; byBackend: Partial<Record<QuantumBackendId, number>> }>({ key: "", byBackend: {} });
  const quotes = quoteState.key === quoteKey ? quoteState.byBackend : {};
  const price = comparePrice(backends, shots, quotes);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"quoting" | "submitting" | null>(null);

  const anyPaid = backends.some(isPaidBackend);
  const { data: credits } = useQuery({
    queryKey: ["billing", "credits"],
    queryFn: () => fetchJson<Credits>("/api/billing/credits"),
    enabled: anyPaid || price.lines.some((l) => l.kind !== "free"),
  });
  const balance = credits?.remainingCents ?? null;
  const blockedByCredits = anyPaid && credits !== undefined && (!credits.hasUnlocked || credits.remainingCents <= 0);
  const overBalance = balance !== null && price.total > balance;
  const enough = selection.length >= COMPARE_MIN && selection.length <= COMPARE_MAX;
  const showPrices = price.lines.some((l) => l.kind !== "free");

  async function run() {
    setCheckedShots(shots);
    if (!enough || reasons.length > 0 || shotsProblem || busy) return;
    setQuoteError(null);
    let byBackend = quotes;
    if (price.missingQuotes.length > 0) {
      setBusy("quoting");
      try {
        const got = await Promise.all(
          price.missingQuotes.map(async (b) => [b, (await fetchJobPrice(b, payload, shots)).priceCredits] as const),
        );
        byBackend = { ...quotes, ...Object.fromEntries(got) };
        setQuoteState({ key: quoteKey, byBackend });
      } catch (err) {
        setQuoteError(err instanceof Error && err.message ? err.message : "Couldn't get a price. Try again.");
        return;
      } finally {
        setBusy(null);
      }
      // A new price is shown first, to confirm with the next click.
      if (price.needsPrice || comparePrice(backends, shots, byBackend).total !== price.total) return;
    }
    const final = comparePrice(backends, shots, byBackend);
    if (balance !== null && final.total > balance) return;

    setBusy("submitting");
    const submittedAt = new Date().toISOString();
    const kinds = new Map(final.lines.map((l) => [l.backend, l]));
    try {
      const jobs = await submitCompare(selection, (b) =>
        submitQuantumJob(b, payload, shots, kinds.get(b)?.kind === "quoted" ? (kinds.get(b)?.credits ?? undefined) : undefined, templateName),
      );
      onRun({ id: submittedAt, jobs, ideal, shots, submittedAt });
      queryClient.invalidateQueries({ queryKey: ["lr-jobs-list"] });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    } finally {
      setBusy(null);
    }
  }

  if (anyPaid && credits === undefined) return <span className="block h-10 animate-pulse default-radius bg-gray-100" />;
  if (blockedByCredits) return <CreditsSummary />;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <ShotsInput value={shots} onChange={setShots} onBlur={() => setCheckedShots(shots)} error={shotsError} />

      {reasons.length > 0 && (
        <div className="default-radius border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-composer-blockers>
          <ul className="list-disc space-y-1 pl-4">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {showPrices && selection.length > 0 && (
        <div className="default-radius border border-gray-100 bg-white p-3 text-sm" data-compare-price>
          {price.lines.map((l) => (
            <div key={l.backend} className="flex justify-between gap-3">
              <span className="truncate text-gray-600">{selection.find((s) => s.backend === l.backend)?.name}</span>
              <span className="shrink-0 text-gray-900">
                {l.credits === null ? "—" : l.credits === 0 ? "Free" : `${l.credits.toLocaleString()} credits`}
              </span>
            </div>
          ))}
          <div className="mt-2 flex justify-between gap-3 border-t border-gray-100 pt-2 font-semibold">
            <span>Total</span>
            <span>{price.total.toLocaleString()} credits</span>
          </div>
          {balance !== null && (
            <div className="flex justify-between gap-3 text-gray-600">
              <span>Your balance</span>
              <span>{balance.toLocaleString()} credits</span>
            </div>
          )}
          {overBalance && <p className="mt-2 text-red-600">Not enough credits.</p>}
        </div>
      )}

      {quoteError && <p className="text-sm text-red-500">{quoteError}</p>}

      <LRButton
        variant="primary"
        type="submit"
        className="w-full"
        disabled={!enough || reasons.length > 0 || !!shotsError || overBalance || busy !== null}
      >
        {busy === "quoting" ? "Getting price…" : busy === "submitting" ? "Submitting…" : compareButtonLabel(price)}
      </LRButton>
      {!enough && (
        <p className="text-center text-xs text-gray-500" data-compare-choose>
          Choose {COMPARE_MIN} to {COMPARE_MAX} backends
        </p>
      )}
    </form>
  );
}
