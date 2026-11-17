"use client";

import WarningBox from "@/components/WarningBox";
import type { JobSubmission } from "@/hooks/useJobSubmission";
import Link from "next/link";

// The price, error and warning block above a submit button, shared by
// BackendSubmitModal and the /composer run panel (both driven by
// useJobSubmission), so the Forte "Get price" and confirm step reads the same
// everywhere.
export default function JobSubmitControls({ submission }: { submission: JobSubmission }) {
  const {
    pricedPerJob,
    quote,
    priceNotice,
    balanceCredits,
    priceAboveBalance,
    perShotPrice,
    quoteError,
    submitError,
    needsCredits,
  } = submission;

  return (
    <>
      {pricedPerJob && quoteError && (
        <p className="text-sm text-red-500">
          {quoteError instanceof Error && quoteError.message
            ? quoteError.message
            : "Couldn't get a price. Try again."}
        </p>
      )}

      {quote && (
        <div className="default-radius border border-gray-100 bg-gray-50 p-4 text-sm" data-job-price>
          {priceNotice && <p className="mb-2 text-amber-700">{priceNotice}</p>}
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Price for this job</span>
            <span className="font-semibold text-gray-900">{quote.priceCredits.toLocaleString()} credits</span>
          </div>
          {pricedPerJob && quote.minimumCredits != null && quote.minimumCredits > 0 && (
            <p className="mt-1 text-right text-xs text-gray-500" data-forte-minimum>
              Minimum {quote.minimumCredits.toLocaleString()} credits per job
            </p>
          )}
          {balanceCredits !== null && (
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-gray-600">Your balance</span>
              <span className="text-gray-900">{balanceCredits.toLocaleString()} credits</span>
            </div>
          )}
          {priceAboveBalance ? (
            <p className="mt-3 text-red-600" data-price-blocked>
              You need {quote.priceCredits.toLocaleString()} credits for this job but have{" "}
              {balanceCredits!.toLocaleString()}.{" "}
              <Link href="/settings/manage-credits/purchase" className="brand-link">
                Buy credits
              </Link>{" "}
              to submit it.
            </p>
          ) : (
            <p className="mt-3 text-gray-500">
              The price is charged when you submit. It is not adjusted after the job runs.
            </p>
          )}
        </div>
      )}

      {/* Per-shot paid backends (IQM, Rigetti): the price is on the submit button; the balance sits above it. */}
      {perShotPrice !== null && !quote && balanceCredits !== null && (
        <div className="text-sm" data-balance>
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Your balance</span>
            <span className="text-gray-900">{balanceCredits.toLocaleString()} credits</span>
          </div>
          {priceAboveBalance && (
            <p className="mt-2 text-red-600" data-price-blocked>
              You need {perShotPrice.toLocaleString()} credits for this job but have {balanceCredits.toLocaleString()}.{" "}
              <Link href="/settings/manage-credits/purchase" className="brand-link">
                Buy credits
              </Link>{" "}
              to submit it.
            </p>
          )}
        </div>
      )}

      {submitError && (
        <p className="text-sm text-red-500">
          {submitError instanceof Error && submitError.message
            ? submitError.message
            : "Couldn't submit the job. Try again."}
        </p>
      )}

      {needsCredits && <WarningBox>QPU jobs cost credits</WarningBox>}
    </>
  );
}
