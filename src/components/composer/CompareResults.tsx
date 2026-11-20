"use client";

import JobStatusBadge from "@/components/jobs/JobStatusBadge";
import {
  COMPARE_SORTED_OUTCOMES,
  formatMatch,
  matchToIdeal,
  toDistribution,
  unionOutcomes,
  type CompareJob,
  type Distribution,
} from "@/lib/composer/compare";
import { formatDuration } from "@/lib/formatDuration";
import { shortenBitstring } from "@/lib/jobs/outcomes";
import { fetchQuantumJobDetail, fetchQuantumJobResult } from "@/lib/quantum/client";
import { TERMINAL_JOB_STATUSES as TERMINAL, type JobDetail } from "@/types/job";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";

/** One Compare run, kept by the composer while the page is open. */
export interface CompareRun {
  id: string;
  jobs: CompareJob[];
  /** In-browser statevector of the circuit as submitted; null above the preview limit. */
  ideal: Distribution | null;
  shots: number;
  submittedAt: string;
}

/** After COMPLETED, keep polling this long for a finish time (some backends report it a little later). */
const FINISH_TIME_GRACE_MS = 60_000;

// Results side by side: one card per backend, plus the ideal distribution
// when there is one. Every card draws the same outcomes in the same order
// (unionOutcomes), so the bars line up. Each job is polled on its own, with
// the same query keys as the Jobs page popup (shared cache), so a card fills
// in as soon as its job finishes and a failed job never holds up the rest.
export default function CompareResults({ run, onClose }: { run: CompareRun; onClose: () => void }) {
  // A new run comes into view (on narrow screens it sits above the run panel).
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const terminalAt = useRef(new Map<string, number>());
  const details = useQueries({
    queries: run.jobs.map((job) => ({
      queryKey: ["lr-job-detail", job.jobId],
      queryFn: () => fetchQuantumJobDetail(job.jobId!),
      enabled: job.jobId !== null,
      retry: 0,
      refetchInterval: (query: { state: { data?: JobDetail } }) => {
        const d = query.state.data;
        if (!d || !TERMINAL.has(d.status)) return 3000;
        if (d.status !== "COMPLETED" || d.finishedAt) return false;
        const first = terminalAt.current.get(job.jobId!) ?? Date.now();
        terminalAt.current.set(job.jobId!, first);
        return Date.now() - first < FINISH_TIME_GRACE_MS ? 3000 : false;
      },
    })),
  });
  const results = useQueries({
    queries: run.jobs.map((job, i) => ({
      queryKey: ["lr-job-result", job.jobId],
      queryFn: () => fetchQuantumJobResult(job.jobId!),
      enabled: job.jobId !== null && details[i].data?.status === "COMPLETED",
    })),
  });

  const dists = results.map((r) => (r.data ? toDistribution(r.data) : null));
  const order = unionOutcomes([...(run.ideal ? [run.ideal] : []), ...dists.filter((d): d is Distribution => d !== null)]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? order : order.slice(0, COMPARE_SORTED_OUTCOMES);

  return (
    <section ref={sectionRef} className="default-radius border-2 border-gray-50 p-4" aria-label="Compare results" data-compare-results>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Compare</h2>
          <p className="text-xs text-gray-500">{run.shots.toLocaleString()} shots</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close results"
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center default-radius text-gray-500 hover:bg-gray-100"
        >
          <MdClose />
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
        {run.ideal && (
          <Card title="Ideal" data-compare-ideal>
            <p className="text-xs text-gray-500">Statevector</p>
            <Bars order={shown} dist={run.ideal} />
          </Card>
        )}
        {run.jobs.map((job, i) => {
          const detail = details[i].data;
          const status = detail?.status ?? "PENDING";
          const dist = dists[i];
          const runtime =
            status === "COMPLETED" && detail?.finishedAt
              ? formatDuration(detail.persistedCreatedAt ?? run.submittedAt, detail.finishedAt)
              : null;
          return (
            <Card key={job.backend} title={job.name} badge={job.jobId ? <JobStatusBadge status={status} /> : null} data-compare-card={job.backend}>
              {job.error ? (
                <p className="break-words text-xs text-red-500" data-compare-error>
                  Not submitted. {job.error}
                </p>
              ) : details[i].error ? (
                <p className="break-words text-xs text-red-500" data-compare-error>
                  {details[i].error.message}
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500">Runtime {runtime ?? "—"}</p>
                  {run.ideal && dist && (
                    <p className="text-xs font-medium text-gray-700" data-compare-match>
                      Match to ideal: {formatMatch(matchToIdeal(dist, run.ideal))}
                    </p>
                  )}
                  {dist ? (
                    <Bars order={shown} dist={dist} />
                  ) : status === "FAILED" || status === "ABORTED" || status === "CANCELLED" ? (
                    <p className="break-words text-xs text-red-500" data-compare-error>
                      {detail?.error ?? `Job ${status.toLowerCase()}.`}
                    </p>
                  ) : (
                    <p className="py-6 text-center text-xs text-gray-400">Waiting for results…</p>
                  )}
                </>
              )}
              {job.jobId && (
                <Link href={`/jobs?job=${encodeURIComponent(job.jobId)}`} className="brand-link mt-auto pt-2 text-xs">
                  View job
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      {order.length > COMPARE_SORTED_OUTCOMES && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="brand-link mt-3 cursor-pointer text-sm"
          aria-expanded={showAll}
        >
          {showAll ? `Show the top ${COMPARE_SORTED_OUTCOMES}` : `Show all ${order.length.toLocaleString()} outcomes`}
        </button>
      )}
    </section>
  );
}

function Card({
  title,
  badge,
  children,
  ...rest
}: { title: string; badge?: React.ReactNode; children: React.ReactNode } & Record<`data-${string}`, string | boolean>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 default-radius border border-gray-100 bg-white p-3" {...rest}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-medium text-gray-900" title={title}>
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** One row per outcome in the shared order, as a share of shots; outcomes this card never saw show 0%. */
function Bars({ order, dist }: { order: string[]; dist: Distribution }) {
  return (
    <div className="mt-1 space-y-1">
      {order.map((outcome) => {
        const pct = (dist[outcome] ?? 0) * 100;
        return (
          <div key={outcome} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 overflow-hidden whitespace-nowrap font-mono text-gray-700" title={outcome.length > 8 ? outcome : undefined}>
              {shortenBitstring(outcome, 8)}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
              <div className="h-3 rounded bg-blue-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-11 shrink-0 text-right tabular-nums text-gray-500">{pct.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}
