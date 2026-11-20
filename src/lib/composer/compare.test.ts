import { describe, expect, test } from "vitest";
import { IONQ_NOISY_SIM_BACKEND } from "@/lib/quantum/ionqPricing";
import { perShotPriceCredits, type QuantumBackendId } from "@/lib/quantum/backends";
import {
  compareButtonLabel,
  comparePrice,
  formatMatch,
  matchToIdeal,
  NOISY_SIM_BACKEND,
  priceKind,
  submitCompare,
  toDistribution,
  totalVariationDistance,
  unionOutcomes,
} from "./compare";

describe("compare: total price across mixed backends", () => {
  test("free, per-shot and Forte: Get price first, then one total to confirm", () => {
    const backends: QuantumBackendId[] = ["ionq-simulator", "iqm-garnet", "rigetti-cepheus", "ionq-forte-1"];
    const perShot = perShotPriceCredits("iqm-garnet", 1000) + perShotPriceCredits("rigetti-cepheus", 1000);
    expect(perShot).toBeGreaterThan(0);

    const before = comparePrice(backends, 1000, {});
    expect(before.lines.map((l) => l.kind)).toEqual(["free", "perShot", "perShot", "quoted"]);
    expect(before.missingQuotes).toEqual(["ionq-forte-1"]);
    expect(before.needsPrice).toBe(true);
    expect(compareButtonLabel(before)).toBe("Get price");

    const after = comparePrice(backends, 1000, { "ionq-forte-1": 2580 });
    expect(after.needsPrice).toBe(false);
    expect(after.total).toBe(perShot + 2580);
    expect(compareButtonLabel(after)).toBe(`Confirm and run (${(perShot + 2580).toLocaleString("en-US")} credits)`);
  });

  test("shots apply to every backend", () => {
    const a = comparePrice(["iqm-garnet", "rigetti-cepheus"], 100, {}).total;
    const b = comparePrice(["iqm-garnet", "rigetti-cepheus"], 1000, {}).total;
    expect(b).toBe(perShotPriceCredits("iqm-garnet", 1000) + perShotPriceCredits("rigetti-cepheus", 1000));
    expect(b).toBeGreaterThan(a);
  });

  test("all free: plain Run, nothing to confirm", () => {
    const p = comparePrice(["ionq-simulator", "iqm-garnet-mock", "rigetti-cepheus-mock"], 1000, {});
    expect(p.total).toBe(0);
    expect(compareButtonLabel(p)).toBe("Run");
  });

  test("the noisy simulator is quoted (free unless priced) but never forces Get price", () => {
    expect(NOISY_SIM_BACKEND).toBe(IONQ_NOISY_SIM_BACKEND);
    expect(priceKind("ionq-forte-1-simulator")).toBe("quoted");
    const p = comparePrice(["ionq-simulator", "ionq-forte-1-simulator"], 1000, {});
    expect(p.missingQuotes).toEqual(["ionq-forte-1-simulator"]);
    expect(p.needsPrice).toBe(false);
    expect(compareButtonLabel(comparePrice(["ionq-simulator", "ionq-forte-1-simulator"], 1000, { "ionq-forte-1-simulator": 30 }))).toBe(
      "Confirm and run (30 credits)",
    );
  });
});

describe("compare: one job per selected backend", () => {
  test("each backend submitted once, in parallel; a refusal stays in its own card", async () => {
    const sent: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const jobs = await submitCompare(
      [
        { backend: "ionq-simulator", name: "IonQ Simulator" },
        { backend: "iqm-garnet", name: "IQM Garnet" },
        { backend: "rigetti-cepheus-mock", name: "Cepheus mock" },
      ],
      async (backend) => {
        sent.push(backend);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        if (backend === "iqm-garnet") throw new Error("Not enough credits.");
        return { uuid: `job-${backend}` };
      },
    );
    expect(sent.sort()).toEqual(["ionq-simulator", "iqm-garnet", "rigetti-cepheus-mock"]);
    expect(maxInFlight).toBe(3);
    expect(jobs).toEqual([
      { backend: "ionq-simulator", name: "IonQ Simulator", jobId: "job-ionq-simulator", error: null },
      { backend: "iqm-garnet", name: "IQM Garnet", jobId: null, error: "Not enough credits." },
      { backend: "rigetti-cepheus-mock", name: "Cepheus mock", jobId: "job-rigetti-cepheus-mock", error: null },
    ]);
  });
});

describe("compare: shared outcome order", () => {
  test("union of every card's outcomes, bitstring order when there are few", () => {
    const ideal = { "00": 0.5, "11": 0.5 };
    const noisy = toDistribution({ "11": 480, "00": 470, "01": 30, "10": 20 });
    const other = toDistribution({ "00": 500, "11": 499, "10": 1 });
    expect(unionOutcomes([ideal, noisy, other])).toEqual(["00", "01", "10", "11"]);
    // Same order whichever card is listed first.
    expect(unionOutcomes([other, noisy, ideal])).toEqual(["00", "01", "10", "11"]);
  });

  test("many outcomes: largest combined share first, ties in bitstring order", () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 32; i++) wide[i.toString(2).padStart(5, "0")] = 1;
    wide["11111"] = 100;
    wide["00000"] = 50;
    const order = unionOutcomes([toDistribution(wide)]);
    expect(order).toHaveLength(32);
    expect(order.slice(0, 4)).toEqual(["11111", "00000", "00001", "00010"]);
  });

  test("counts become shares; register spaces are dropped", () => {
    expect(toDistribution({ "0 1": 25, "01": 25, "10": 50 })).toEqual({ "01": 0.5, "10": 0.5 });
    expect(toDistribution({})).toEqual({});
  });
});

describe("compare: match to ideal", () => {
  test("1 minus total variation distance", () => {
    const ideal = { "00": 0.5, "11": 0.5 };
    expect(matchToIdeal(ideal, ideal)).toBe(1);
    expect(matchToIdeal({ "01": 1 }, ideal)).toBe(0);
    // |0.48-0.5| + |0.47-0.5| + 0.03 + 0.02 = 0.10, halved = 0.05.
    const noisy = toDistribution({ "11": 480, "00": 470, "01": 30, "10": 20 });
    expect(totalVariationDistance(noisy, ideal)).toBeCloseTo(0.05, 12);
    expect(matchToIdeal(noisy, ideal)).toBeCloseTo(0.95, 12);
    expect(formatMatch(matchToIdeal(noisy, ideal))).toBe("95.0%");
    expect(formatMatch(0.97412)).toBe("97.4%");
  });

  test("symmetric, and outcomes missing from one side count in full", () => {
    const p = { "0": 0.9, "1": 0.1 };
    const q = { "0": 0.6, "1": 0.3, "2": 0.1 };
    expect(totalVariationDistance(p, q)).toBeCloseTo(totalVariationDistance(q, p), 12);
    expect(totalVariationDistance(p, q)).toBeCloseTo(0.3, 12);
  });
});
