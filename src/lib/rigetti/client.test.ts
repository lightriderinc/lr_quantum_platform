import { afterEach, describe, expect, test, vi } from "vitest";
import { CEPHEUS_1_108Q_PUBLISHED_SPECS } from "./cepheusPublishedSpecs";
import { fetchRigettiBackends } from "./client";

describe("Rigetti mock card", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("shows Rigetti's published Cepheus-1-108Q specs, even when the live ISA fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));

    const cards = await fetchRigettiBackends();

    expect(cards.map((b) => b.id)).toEqual(["rigetti.qpu.Cepheus-1-108Q:mock"]);
    const [mock] = cards;
    expect(mock.type).toBe("Simulator");
    expect(mock.qubits).toBe(107);
    expect(mock.availability?.availableNow).toBe(true);
    expect(mock.details).toMatchObject({
      topology: "12 interconnected 9-qubit chiplets",
      nativeGates: ["RX", "RZ", "CZ", "MEASURE"],
      medianOneQubitFidelity: 99.84,
      medianTwoQubitFidelity: 98.67,
      medianT1Us: 27,
      medianT2RamseyUs: 10,
    });
    expect(mock.details).toMatchObject(CEPHEUS_1_108Q_PUBLISHED_SPECS.details);
    // Published figures are for the real QPU; the card must say so.
    expect(mock.details?.description).toMatch(/not measurements of this simulator/);
  });
});
