import type {
  AvailabilityWindow,
  Backend,
  BackendAvailability,
} from "@/types/backend";

// Shared helpers for the live queue + availability shown on backend cards and
// in the detail modal. `deriveAvailability` runs where the provider data is
// fetched (lib/iqm/client.ts); the formatters run in the UI. Kept together so
// the two surfaces phrase queue and availability identically.

// Turns a provider's list of available time windows into the summary the UI
// renders. Simulators are always available (no hardware queue/windows).
// Returns undefined when there's no usable window data, so callers omit the
// field rather than render a misleading "unavailable".
export function deriveAvailability(
  available: AvailabilityWindow[] | undefined,
  isSimulator: boolean,
): BackendAvailability | undefined {
  if (isSimulator) return { availableNow: true, nextWindowStart: null };
  if (!available || available.length === 0) return undefined;

  const now = Date.now();
  const windows = available
    .filter(
      (w) =>
        Number.isFinite(Date.parse(w.start)) &&
        Number.isFinite(Date.parse(w.end)),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (windows.length === 0) return undefined;

  // IQM clamps the currently-open window's `start` to its own server clock at
  // response time, which sits a few hundred ms — plus any client clock skew and
  // proxy/network latency — ahead of the browser's `now`. A strict `start <= now`
  // check just misses, so an open machine flickers to "Available at <now>". A
  // grace margin at the start edge absorbs that (windows are hours long, so a
  // minute of slack never mislabels a genuinely-later window).
  const START_GRACE_MS = 60_000;
  const availableNow = windows.some(
    (w) => Date.parse(w.start) - START_GRACE_MS <= now && now < Date.parse(w.end),
  );
  if (availableNow) return { availableNow: true, nextWindowStart: null, windows };

  const next = windows.find((w) => Date.parse(w.start) > now);
  return { availableNow: false, nextWindowStart: next?.start ?? null, windows };
}

// "3 jobs" / "1 job" / "—" for an unknown depth. Matches the phrasing the
// backend modal already used for its queue line.
export function formatQueue(queueDepth: number | null): string {
  if (queueDepth === null) return "—";
  return `${queueDepth} ${queueDepth === 1 ? "job" : "jobs"}`;
}

// Predicted queue time for providers that report one (IonQ) rather than a
// depth, phrased like IonQ Cloud: "0 min", "12 min", "1 hr 5 min",
// "16 hrs 59 min", "3 hrs". Rounded to the nearest minute.
export function formatQueueTime(ms: number): string {
  const totalMinutes = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  const hrs = `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  return minutes === 0 ? hrs : `${hrs} ${minutes} min`;
}

// Short label for a card/modal row: "Available now", "Available at 8:00 PM"
// (later today), or "Available Fri, 8:00 PM" (another day). Returns null when
// we can't say, so callers omit the row.
export function formatAvailability(
  availability: BackendAvailability | undefined,
): string | null {
  if (!availability) return null;
  if (availability.availableNow) return "Available now";
  if (!availability.nextWindowStart) return null;

  const start = new Date(availability.nextWindowStart);
  if (Number.isNaN(start.getTime())) return null;

  const time = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const now = new Date();
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  if (sameDay) return `Available at ${time}`;

  const day = start.toLocaleDateString([], { weekday: "short" });
  return `Available ${day}, ${time}`;
}

// Tailwind text color for the availability label: the status badge's online
// green when available now, its offline gray otherwise — so the availability
// text tracks the same palette as the status light.
export function availabilityTextClass(
  availability: BackendAvailability | undefined,
): string {
  return availability?.availableNow ? "text-emerald-600" : "text-gray-400";
}

export type AvailabilityTone = "available" | "unavailable" | "unknown";

export interface AvailabilitySummary {
  label: string;
  tone: AvailabilityTone;
}

// The one-line availability the catalog card and list row show (in place of
// the old status badge). The window schedule says when a machine is meant to
// run jobs; the status light says whether it actually can. So a machine its
// provider reports as down, or as in-window but not taking jobs (paused, e.g.
// no calibration), reads "Unavailable" whatever the schedule says. A status
// we couldn't confirm ("unknown") never overrides the schedule, and with no
// schedule to fall back on it reads "Unknown" rather than looking like down.
// Returns null when the provider doesn't report availability at all, so
// callers render nothing instead of a guess.
export function summarizeAvailability(
  backend: Pick<Backend, "availability" | "status">,
): AvailabilitySummary | null {
  const { availability, status } = backend;
  if (!availability) return null;

  const blocked =
    status === "offline" ||
    status === "maintenance" ||
    (status === "paused" && availability.availableNow);

  if (!blocked) {
    const label = formatAvailability(availability);
    if (label) {
      return { label, tone: availability.availableNow ? "available" : "unavailable" };
    }
    if (status === "unknown") return { label: "Unknown", tone: "unknown" };
  }
  return { label: "Unavailable", tone: "unavailable" };
}

export interface BackendCondition extends AvailabilitySummary {
  /** Offline or Unavailable: can't run a job now and isn't waiting for a window. Greyed out and not selectable where jobs are submitted. */
  blocked: boolean;
}

// The one state every surface shows for a backend (catalog card and row,
// detail modal, composer run panel, submit popups), so a status light and an
// availability line can never disagree ("Offline" next to "Available now").
// A provider-reported outage wins over any schedule; otherwise the schedule
// (summarizeAvailability) decides; providers with no schedule fall back to
// the status light alone. "Available Fri, 2:45 AM" (healthy, between
// windows) isn't blocked: a job submitted now waits for that window.
export function backendCondition(
  backend: Pick<Backend, "availability" | "status" | "statusInfo">,
): BackendCondition {
  const { status } = backend;
  if (status === "offline") return { label: "Offline", tone: "unavailable", blocked: true };
  if (status === "maintenance") return { label: "Maintenance", tone: "unavailable", blocked: true };
  const summary = summarizeAvailability(backend);
  if (summary) return { ...summary, blocked: summary.label === "Unavailable" };
  if (status === "online") return { label: "Available now", tone: "available", blocked: false };
  if (status === "paused") return { label: "Unavailable", tone: "unavailable", blocked: true };
  return { label: backend.statusInfo?.label ?? "Unknown", tone: "unknown", blocked: false };
}
