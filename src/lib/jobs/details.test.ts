import { describe, expect, test } from "vitest";
import { circuitTemplate } from "@/lib/circuits/templates";
import { formatCreditsCharged, jobCircuit, showCancel } from "./details";

describe("job details", () => {
  test("credits charged, 0 for free simulators", () => {
    expect(formatCreditsCharged(0)).toBe("0 credits");
    expect(formatCreditsCharged(1)).toBe("1 credit");
    expect(formatCreditsCharged(1250)).toBe("1,250 credits");
    expect(formatCreditsCharged(undefined)).toBeNull();
  });

  test("Cancel only on IonQ, and only while the job waits to run", () => {
    for (const b of ["ionq-simulator", "ionq-forte-1-simulator", "ionq-forte-1", "ionq-forte-enterprise-1"]) {
      expect(showCancel(b, "PENDING")).toBe(true);
      expect(showCancel(b, "WAITING")).toBe(true);
      expect(showCancel(b, "PROCESSING")).toBe(false);
      expect(showCancel(b, "COMPLETED")).toBe(false);
    }
    for (const b of ["iqm-garnet", "iqm-garnet-mock", "rigetti-cepheus", "rigetti-cepheus-mock", "unknown", undefined]) {
      expect(showCancel(b, "PENDING")).toBe(false);
    }
  });

  test("the circuit that ran: OpenQASM 3, with the stored template name for a template job", () => {
    const payload = circuitTemplate("bell").build().payload;
    const bell = jobCircuit({ ...payload, lr_template: "Bell pair" });
    expect(bell?.presetName).toBe("Bell pair");
    // No stored name (edited in the composer, an API job, or from before names were stored): just "Circuit".
    expect(jobCircuit(payload)?.presetName).toBeNull();
    expect(bell?.qasm).toBe(
      'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[2] q;\nbit[2] c;\n\nh q[0];\ncx q[0], q[1];\nc[0] = measure q[0];\nc[1] = measure q[1];\n',
    );
    const own = jobCircuit({ name: "composer", num_qubits: 1, instructions: [{ name: "rx", qubits: [0], params: [Math.PI / 2] }] });
    expect(own?.presetName).toBeNull();
    expect(own?.qasm).toContain("rx(pi/2) q[0];");
    expect(jobCircuit(null)).toBeNull(); // jobs from before circuits were stored
  });
});
