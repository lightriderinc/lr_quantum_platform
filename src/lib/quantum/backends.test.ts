import { describe, expect, test } from "vitest";
import { parseShots } from "@/components/quantum/ShotsInput";
import { DEFAULT_MAX_SHOTS, QUANTUM_BACKENDS, qubitLimitError, shotsLimitError, type QuantumBackendId } from "./backends";

describe("pre-submit checks (shared by the submit route and every submit path in the UI)", () => {
  test("oversized circuit is blocked with the backend's own name and limit", () => {
    expect(qubitLimitError("iqm-garnet-mock", 13)).toBe("This circuit has 13 qubits. IQM Garnet (mock) supports up to 12.");
    expect(qubitLimitError("iqm-garnet-mock", 12)).toBeNull();
    expect(qubitLimitError("ionq-forte-enterprise-1", 37)).toBe("This circuit has 37 qubits. IonQ Forte Enterprise-1 supports up to 36.");
    expect(qubitLimitError("iqm-garnet", undefined)).toBeNull(); // malformed circuits are qpu-proxy's to reject
  });

  test("shots: at least 1, at most the backend's max", () => {
    expect(shotsLimitError("iqm-garnet", 1)).toBeNull();
    expect(shotsLimitError("iqm-garnet", 100_000)).toBeNull();
    expect(shotsLimitError("iqm-garnet", 100_001)).toBe("Max 100,000 shots on IQM Garnet");
    expect(shotsLimitError("iqm-garnet", 0)).toBe("At least 1 shot");
    expect(shotsLimitError("iqm-garnet", 1.5)).toBe("At least 1 shot");
    expect(shotsLimitError("iqm-garnet", Number.NaN)).toBe("At least 1 shot");
  });

  test("every backend has a name and limits (one shared table)", () => {
    for (const [id, c] of Object.entries(QUANTUM_BACKENDS)) {
      expect(c.name, id).toBeTruthy();
      expect(c.maxQubits, id).toBeGreaterThan(0);
      expect(c.maxShots, id).toBe(DEFAULT_MAX_SHOTS); // no provider documents a lower limit today
      expect(shotsLimitError(id as QuantumBackendId, 1000)).toBeNull();
    }
  });
});

describe("shots box: typed text to a shot count", () => {
  test("empty, partial and decimal input reach the same check instead of being corrected", () => {
    expect(shotsLimitError("iqm-garnet", parseShots(""))).toBe("At least 1 shot");
    expect(shotsLimitError("iqm-garnet", parseShots("000"))).toBe("At least 1 shot");
    expect(shotsLimitError("iqm-garnet", parseShots("2.5"))).toBe("At least 1 shot");
    expect(shotsLimitError("iqm-garnet", parseShots("200000"))).toBe("Max 100,000 shots on IQM Garnet");
    expect(parseShots("2000")).toBe(2000);
  });
});
