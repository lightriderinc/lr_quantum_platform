import { describe, expect, test } from "vitest";
import { RESULT_TOP_OUTCOMES, shortenBitstring, visibleOutcomes } from "./outcomes";

describe("shortenBitstring", () => {
  test("short strings stay whole", () => {
    expect(shortenBitstring("0101")).toBe("0101");
    expect(shortenBitstring("0".repeat(16))).toBe("0".repeat(16));
  });

  test("long strings keep the start and end around an ellipsis", () => {
    const bits = "000011110000111100001111000011110000"; // 36 bits
    const short = shortenBitstring(bits);
    expect(short).toHaveLength(16);
    expect(short.startsWith(bits.slice(0, 8))).toBe(true);
    expect(short.endsWith(bits.slice(-7))).toBe(true);
    expect(short).toContain("…");
  });
});

describe("visibleOutcomes", () => {
  const counts = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i.toString(2).padStart(5, "0"), 100 - i]));

  test("top 10 by count, then all on request", () => {
    const top = visibleOutcomes(counts, false);
    expect(top.total).toBe(25);
    expect(top.shown).toHaveLength(RESULT_TOP_OUTCOMES);
    expect(top.shown[0]).toEqual(["00000", 100]);
    expect(visibleOutcomes(counts, true).shown).toHaveLength(25);
  });

  test("ties break by bitstring so the order is stable", () => {
    expect(visibleOutcomes({ "11": 5, "00": 5, "01": 9 }, false).shown).toEqual([
      ["01", 9],
      ["00", 5],
      ["11", 5],
    ]);
  });
});
