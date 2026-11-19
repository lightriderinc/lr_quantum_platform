import { describe, expect, test } from "vitest";
import { formatQueueTime, summarizeAvailability } from "./availability";

describe("formatQueueTime", () => {
  test("hours and minutes, like IonQ Cloud", () => {
    expect(formatQueueTime(0)).toBe("0 min");
    expect(formatQueueTime(20_000)).toBe("0 min");
    expect(formatQueueTime(60_000)).toBe("1 min");
    expect(formatQueueTime(1_181_215)).toBe("20 min");
    expect(formatQueueTime(60 * 60_000)).toBe("1 hr");
    expect(formatQueueTime(65 * 60_000)).toBe("1 hr 5 min");
    expect(formatQueueTime(3 * 3_600_000)).toBe("3 hrs");
    expect(formatQueueTime((16 * 60 + 59) * 60_000 + 10_000)).toBe("16 hrs 59 min");
  });

  test("bad input reads as no wait rather than NaN", () => {
    expect(formatQueueTime(-5)).toBe("0 min");
    expect(formatQueueTime(Number.NaN)).toBe("0 min");
  });
});

describe("summarizeAvailability", () => {
  const open = { availableNow: true, nextWindowStart: null };
  const noUpcomingWindow = { availableNow: false, nextWindowStart: null };
  const unavailable = { label: "Unavailable", tone: "unavailable" };

  test("nothing to show when the provider doesn't report availability", () => {
    expect(summarizeAvailability({ status: "online" })).toBeNull();
  });

  test("an open window on a healthy machine reads Available", () => {
    expect(summarizeAvailability({ status: "online", availability: open })).toEqual({
      label: "Available",
      tone: "available",
    });
  });

  test("a provider-reported problem overrides an open window", () => {
    for (const status of ["offline", "maintenance", "paused"] as const) {
      expect(summarizeAvailability({ status, availability: open })).toEqual(unavailable);
    }
  });

  test("outside a window it still points to the next one", () => {
    const nextWindowStart = new Date(Date.now() + 2 * 24 * 3_600_000).toISOString();
    const summary = summarizeAvailability({
      status: "paused",
      availability: { availableNow: false, nextWindowStart },
    });
    expect(summary?.tone).toBe("unavailable");
    expect(summary?.label).toMatch(/^Available /);
  });

  test("an unconfirmed status keeps the schedule, and reads Unknown without one", () => {
    expect(summarizeAvailability({ status: "unknown", availability: open })?.label).toBe(
      "Available",
    );
    expect(summarizeAvailability({ status: "unknown", availability: noUpcomingWindow })).toEqual({
      label: "Unknown",
      tone: "unknown",
    });
  });

  test("no upcoming window on a known status reads Unavailable", () => {
    expect(summarizeAvailability({ status: "online", availability: noUpcomingWindow })).toEqual(
      unavailable,
    );
  });
});
