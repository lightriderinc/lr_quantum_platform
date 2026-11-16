// Helpers for showing measurement outcomes (bitstrings) in job results and
// the composer, where a 36-qubit job gives 36-character keys.

/** Bars shown before "Show all N outcomes". */
export const RESULT_TOP_OUTCOMES = 10;

/**
 * A bitstring short enough for a label: kept whole up to `max` characters,
 * otherwise the start and end with "…" between them (the full string goes
 * in a tooltip). "0101010101010101010110" with max 16 gives "0101010…1010110".
 */
export function shortenBitstring(bits: string, max = 16): string {
  if (bits.length <= max) return bits;
  const keep = Math.max(2, max - 1);
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${bits.slice(0, head)}…${bits.slice(bits.length - tail)}`;
}

/** Outcomes largest first (ties by bitstring), and the slice to draw: the top RESULT_TOP_OUTCOMES unless `showAll`. */
export function visibleOutcomes(
  counts: Record<string, number>,
  showAll: boolean,
): { shown: [string, number][]; total: number } {
  const sorted = Object.entries(counts).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return { shown: showAll ? sorted : sorted.slice(0, RESULT_TOP_OUTCOMES), total: sorted.length };
}
