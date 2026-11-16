import { describe, expect, test } from "vitest";
import { resolveMode } from "./JobModeTag";

describe("job Mode label", () => {
  test("IonQ: Cloud for Forte and the Forte noise simulator, Simulator for ionq:mock", () => {
    expect(resolveMode("ionq-forte-1")).toBe("IonQ Cloud");
    expect(resolveMode("ionq-forte-enterprise-1")).toBe("IonQ Cloud");
    expect(resolveMode("ionq-forte-1-simulator")).toBe("IonQ Cloud");
    expect(resolveMode("ionq-simulator")).toBe("Simulator");
  });

  test("IQM and Rigetti unchanged", () => {
    expect(resolveMode("iqm-garnet-mock")).toBe("Mock run");
    expect(resolveMode("rigetti-cepheus-mock")).toBe("Mock run");
    expect(resolveMode("iqm-garnet")).toBe("Live");
    expect(resolveMode("rigetti-cepheus")).toBe("Live");
  });

  test("unknown backend: no label", () => {
    expect(resolveMode(undefined)).toBeNull();
    expect(resolveMode("nope")).toBeNull();
  });
});
