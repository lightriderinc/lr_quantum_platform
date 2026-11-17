"use client";

import {
  summarizeAvailability,
  type AvailabilityTone,
} from "@/lib/backends/availability";
import { describeStatus } from "@/lib/backends/status/present";
import {
  isReservationOnlyBackend,
  RESERVATION_PAGE_HREF,
} from "@/lib/quantum/reservations";
import type { Backend } from "@/types/backend";
import Link from "next/link";
import type { ReactNode } from "react";
import { MdArrowForward } from "react-icons/md";

// Same dot + text treatment as BackendStatusBadge, so the catalog keeps its
// look. `unknown` is a hollow ring, so "can't confirm" never looks like down.
const TONE_STYLES: Record<AvailabilityTone, { dot: string; text: string }> = {
  available: { dot: "bg-emerald-500", text: "text-emerald-700" },
  unavailable: { dot: "bg-gray-400", text: "text-gray-500" },
  unknown: { dot: "border border-gray-400 bg-transparent", text: "text-gray-400" },
};

// What a catalog card or list row shows for a backend: whether it can run a
// job now, or when it next can (see summarizeAvailability). The
// reservation-only Cepheus QPU gets a booking link instead, since it only runs
// jobs in a reserved slot. `fallback` renders when the provider doesn't report
// availability (e.g. a dash in a table cell).
export default function BackendAvailabilityBadge({
  backend,
  fallback = null,
}: {
  backend: Backend;
  fallback?: ReactNode;
}) {
  if (isReservationOnlyBackend(backend.id)) {
    return (
      <Link
        href={RESERVATION_PAGE_HREF}
        // Cards and rows open the detail modal on click (and on Enter, for
        // cards); keep both from firing when the link itself is used.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-gray-700 transition-colors hover:text-[var(--brand-primary)]"
      >
        Book a reservation <MdArrowForward />
      </Link>
    );
  }

  const summary = summarizeAvailability(backend);
  if (!summary) return <>{fallback}</>;

  const style = TONE_STYLES[summary.tone];
  // When it isn't available, the status light's reason says why.
  const reason =
    summary.tone !== "available" && backend.statusInfo
      ? describeStatus(backend.status, backend.statusInfo)
      : undefined;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium ${style.text}`}
      title={reason}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
      {summary.label}
    </span>
  );
}
