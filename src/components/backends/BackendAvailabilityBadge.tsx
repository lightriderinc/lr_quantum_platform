"use client";

import { backendCondition, type AvailabilityTone } from "@/lib/backends/availability";
import { describeStatus } from "@/lib/backends/status/present";
import {
  isReservationOnlyBackend,
  RESERVATION_PAGE_HREF,
} from "@/lib/quantum/reservations";
import type { Backend } from "@/types/backend";
import Link from "next/link";
import { MdArrowForward } from "react-icons/md";

// Same dot + text treatment as BackendStatusBadge, so the catalog keeps its
// look. `unknown` is a hollow ring, so "can't confirm" never looks like down.
const TONE_STYLES: Record<AvailabilityTone, { dot: string; text: string }> = {
  available: { dot: "bg-emerald-500", text: "text-emerald-700" },
  unavailable: { dot: "bg-gray-400", text: "text-gray-500" },
  unknown: { dot: "border border-gray-400 bg-transparent", text: "text-gray-400" },
};

// What every surface shows for a backend: the shared backendCondition (so
// status and availability never disagree). The reservation-only Cepheus QPU
// gets a booking link instead in the catalog, since it only runs jobs in a
// reserved slot; pickers pass `plain` to show its condition instead.
export default function BackendAvailabilityBadge({
  backend,
  plain = false,
}: {
  backend: Backend;
  /** Always the condition label, never the booking link (inside a radio label, for example). */
  plain?: boolean;
}) {
  if (!plain && isReservationOnlyBackend(backend.id)) {
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

  const condition = backendCondition(backend);
  const style = TONE_STYLES[condition.tone];
  // When it isn't available, the status light's reason says why.
  const reason =
    condition.tone !== "available" && backend.statusInfo
      ? describeStatus(backend.status, backend.statusInfo)
      : undefined;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium ${style.text}`}
      title={reason}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
      {condition.label}
    </span>
  );
}
