import { describe, expect, test } from "vitest";
import { backendCondition, deriveAvailability } from "@/lib/backends/availability";
import { presentStatus } from "@/lib/backends/status/present";
import { nextState } from "@/lib/backends/status/stateMachine";
import type { Backend } from "@/types/backend";
import { calibratedQubitCount, deriveStatus } from "./client";
import { readIqmHealth } from "./health";
import { classifyHealth } from "./statusProbe";

// Response shapes as IQM Resonance returns them (2026-11-18), for
// GET quantum-computers/{alias}/health and /queue-availability.
const now = Date.now();
const stamp = new Date(now - 5_000).toISOString();
const health = (healthy: boolean, operational_status = "online") => ({
  operational_status,
  health: { healthy, updated_at: stamp },
});
const queue = (queue_length: number) => ({
  queue_length,
  available: [
    { start: new Date(now - 1_000).toISOString(), end: new Date(now + 6 * 3_600_000).toISOString() },
    { start: new Date(now + 8 * 3_600_000).toISOString(), end: new Date(now + 30 * 3_600_000).toISOString() },
  ],
});

/** What the browser light builds for a QPU card (lib/iqm/client.ts). */
function card(healthBody: unknown, queueBody: ReturnType<typeof queue>): Pick<Backend, "status" | "availability" | "queueDepth"> {
  return {
    status: deriveStatus(healthBody, now),
    availability: deriveAvailability(queueBody.available, false),
    queueDepth: queueBody.queue_length,
  };
}

describe("IQM health: both response shapes", () => {
  test("current nested shape and the older flat one", () => {
    expect(readIqmHealth(health(true))).toEqual({ healthy: true, updatedAt: stamp, operationalStatus: "online" });
    expect(readIqmHealth({ healthy: false, updated_at: stamp })).toEqual({ healthy: false, updatedAt: stamp, operationalStatus: null });
  });

  test("no `healthy` flag anywhere is no reading, never a down machine", () => {
    expect(readIqmHealth({ operational_status: "online" })).toBeNull();
    expect(deriveStatus({ operational_status: "online" }, now)).toBe("unknown");
    expect(classifyHealth({ operational_status: "online" }).kind).toBe("schema_error");
  });
});

describe("IQM QPU status matches IQM Resonance", () => {
  test("available: healthy, in a window, queue 0", () => {
    const c = card(health(true), queue(0));
    expect(c.status).toBe("online");
    expect(c.queueDepth).toBe(0);
    expect(backendCondition(c)).toEqual({ label: "Available now", tone: "available", blocked: false });
  });

  test("busy: healthy with jobs waiting is still available, with its queue", () => {
    const c = card(health(true), queue(7));
    expect(c.status).toBe("online");
    expect(c.queueDepth).toBe(7);
    expect(backendCondition(c).label).toBe("Available now");
  });

  test("offline: unhealthy, or operational_status offline, reads Offline even inside a window", () => {
    for (const body of [health(false), health(true, "offline"), health(true, "maintenance")]) {
      const c = card(body, queue(0));
      expect(c.status).toBe("offline");
      expect(backendCondition(c)).toEqual({ label: "Offline", tone: "unavailable", blocked: true });
    }
  });

  test("server light: two healthy readings in the nested shape go Online", () => {
    const reading = (at: number) => ({ provider: "IQM", at, acceptingJobs: true, ...classifyHealth(health(true)) });
    expect(classifyHealth(health(true)).kind).toBe("healthy");
    expect(classifyHealth(health(false)).kind).toBe("unhealthy");
    let m = nextState(null, reading(now - 60_000));
    m = nextState(m, reading(now));
    expect(m.state).toBe("online");
    expect(presentStatus(m, now).status).toBe("online");
  });
});

describe("status and availability never disagree", () => {
  test("an outage wins over an open window; between windows is not blocked", () => {
    const open = { availableNow: true, nextWindowStart: null };
    expect(backendCondition({ status: "offline", availability: open }).label).toBe("Offline");
    const later = { availableNow: false, nextWindowStart: new Date(now + 3_600_000).toISOString() };
    const between = backendCondition({ status: "online", availability: later });
    expect(between.label).toMatch(/^Available /);
    expect(between.blocked).toBe(false);
  });

  test("no schedule: the status light alone", () => {
    expect(backendCondition({ status: "online" }).label).toBe("Available now");
    expect(backendCondition({ status: "offline" }).blocked).toBe(true);
    expect(backendCondition({ status: "unknown", statusInfo: { label: "Checking", reason: "" } })).toEqual({
      label: "Checking",
      tone: "unknown",
      blocked: false,
    });
  });
});

describe("calibrated qubits (IQM Sirius: 24 on the chip, 16 calibrated)", () => {
  test("counts qubits with a calibrated prx gate", () => {
    const loci = ["QB1", "QB2", "QB3", "QB4", "QB5", "QB8", "QB9", "QB10", "QB11", "QB13", "QB15", "QB17", "QB19", "QB20", "QB21", "QB23"].map((q) => [q]);
    const dqa = {
      qubits: Array.from({ length: 24 }, (_, i) => `QB${i + 1}`),
      gates: { prx: { default_implementation: "drag_crf", implementations: { drag_crf: { loci } } } },
    };
    expect(calibratedQubitCount(dqa)).toBe(16);
    expect(calibratedQubitCount(null)).toBeNull();
    expect(calibratedQubitCount({ gates: {} })).toBeNull();
  });
});
