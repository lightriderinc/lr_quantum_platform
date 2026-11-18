// IQM's health endpoint (GET api/v1/quantum-computers/{alias}/health), read
// the same way by the browser light (lib/iqm/client.ts) and the server probe
// (lib/iqm/statusProbe.ts).
//
// Shapes seen from IQM Resonance:
//   until ~Nov 2026: { "healthy": true, "updated_at": "..." }
//   2026-11-18:      { "operational_status": "online",
//                      "health": { "healthy": true, "updated_at": "..." } }
// Both are accepted. IQM doesn't document the operational_status values; only
// "online" has been seen, so the `healthy` flag decides, and an
// operational_status of "offline" or "maintenance" also counts as down.

export interface IqmHealth {
  healthy: boolean;
  /** IQM's freshness stamp, or null if missing. */
  updatedAt: string | null;
  operationalStatus: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const DOWN_STATUSES = new Set(["offline", "maintenance"]);

/** The health reading, or null when the body has no `healthy` flag in either shape. */
export function readIqmHealth(body: unknown): IqmHealth | null {
  if (!isRecord(body)) return null;
  const inner = isRecord(body.health) ? body.health : body;
  if (typeof inner.healthy !== "boolean") return null;
  const operationalStatus =
    typeof body.operational_status === "string" ? body.operational_status : null;
  const updatedAt =
    typeof inner.updated_at === "string"
      ? inner.updated_at
      : typeof body.updated_at === "string"
        ? body.updated_at
        : null;
  return {
    healthy: inner.healthy && !(operationalStatus && DOWN_STATUSES.has(operationalStatus.toLowerCase())),
    updatedAt,
    operationalStatus,
  };
}
