import { isPricedPerJob, isPricedPerShot, perShotPriceCredits, type QuantumBackendId } from "@/lib/quantum/backends";

// Compare mode in the composer: the same circuit on 2 to 4 backends at once,
// results side by side. Pure, so pricing, the one-job-per-backend submit,
// the shared outcome order and the match to the ideal are unit tested.

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

// --- Price ----------------------------------------------------------------

/**
 * How a backend's price is known, the same split as the single run
 * (useJobSubmission): free; per shot (IQM, Rigetti: shots times the rate);
 * quoted by the estimate route before submitting (IonQ Forte, and the noisy
 * simulator, which is free unless a price is set).
 */
export type PriceKind = "free" | "perShot" | "quoted";

/** IONQ_NOISY_SIM_BACKEND (lib/quantum/ionqPricing.ts is server-only, so not imported here; a test keeps them equal). */
export const NOISY_SIM_BACKEND: QuantumBackendId = "ionq-forte-1-simulator";

export function priceKind(backend: QuantumBackendId): PriceKind {
  if (isPricedPerJob(backend) || backend === NOISY_SIM_BACKEND) return "quoted";
  return isPricedPerShot(backend) ? "perShot" : "free";
}

export interface ComparePrice {
  /** Each backend's price; null while a quote is still needed. */
  lines: { backend: QuantumBackendId; kind: PriceKind; credits: number | null }[];
  /** Sum of the known prices. */
  total: number;
  /** Quoted backends without a quote yet. */
  missingQuotes: QuantumBackendId[];
  /** A Forte QPU still needs "Get price": nothing runs until its price is shown. */
  needsPrice: boolean;
}

export function comparePrice(
  backends: QuantumBackendId[],
  shots: number,
  quotes: Partial<Record<QuantumBackendId, number>>,
): ComparePrice {
  const lines = backends.map((backend) => {
    const kind = priceKind(backend);
    const credits = kind === "free" ? 0 : kind === "perShot" ? perShotPriceCredits(backend, shots) : (quotes[backend] ?? null);
    return { backend, kind, credits };
  });
  const missingQuotes = lines.filter((l) => l.credits === null).map((l) => l.backend);
  return {
    lines,
    total: lines.reduce((sum, l) => sum + (l.credits ?? 0), 0),
    missingQuotes,
    needsPrice: missingQuotes.some(isPricedPerJob),
  };
}

/** The run button: "Get price" until every Forte price is known, then one confirm for the total when anything costs credits. */
export function compareButtonLabel(price: ComparePrice): string {
  if (price.needsPrice) return "Get price";
  return price.total > 0 ? `Confirm and run (${price.total.toLocaleString("en-US")} credits)` : "Run";
}

// --- Submit ---------------------------------------------------------------

export interface CompareTarget {
  backend: QuantumBackendId;
  /** Display name, e.g. "IQM Garnet". */
  name: string;
}

export interface CompareJob extends CompareTarget {
  /** Null when the submit itself failed. */
  jobId: string | null;
  /** Why the submit failed; null when it was accepted. */
  error: string | null;
}

/**
 * One job per backend, all sent at once. A refused submit (no credits, price
 * changed, backend busy) becomes that backend's error and never stops the
 * others. Results keep the order of `targets`.
 */
export async function submitCompare(
  targets: CompareTarget[],
  submitOne: (backend: QuantumBackendId) => Promise<{ uuid: string }>,
): Promise<CompareJob[]> {
  const settled = await Promise.allSettled(targets.map((t) => submitOne(t.backend)));
  return targets.map((t, i) => {
    const r = settled[i];
    if (r.status === "fulfilled" && r.value.uuid) return { ...t, jobId: r.value.uuid, error: null };
    const reason = r.status === "rejected" ? r.reason : null;
    return { ...t, jobId: null, error: reason instanceof Error && reason.message ? reason.message : "Couldn't submit this job." };
  });
}

// --- Outcomes -------------------------------------------------------------

/** Outcome -> share of shots (0 to 1). */
export type Distribution = Record<string, number>;

/** Counts as shares of all shots. Keys lose any spaces (register separators). */
export function toDistribution(counts: Record<string, number>): Distribution {
  const merged: Record<string, number> = {};
  for (const [key, n] of Object.entries(counts)) {
    if (!Number.isFinite(n) || n <= 0) continue;
    const k = key.replace(/\s+/g, "");
    merged[k] = (merged[k] ?? 0) + n;
  }
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  const out: Distribution = {};
  if (total > 0) for (const [k, n] of Object.entries(merged)) out[k] = n / total;
  return out;
}

/** Up to this many outcomes, the shared order is plain bitstring order (000, 001, ...), like a histogram. */
export const COMPARE_SORTED_OUTCOMES = 16;

/**
 * Every outcome seen in any card, in one order for all of them. Up to
 * COMPARE_SORTED_OUTCOMES: bitstring order. More: largest combined share
 * first (summed over the cards), ties in bitstring order, so the outcomes
 * that matter come first on every card.
 */
export function unionOutcomes(dists: Distribution[]): string[] {
  const combined = new Map<string, number>();
  for (const d of dists) for (const [k, p] of Object.entries(d)) combined.set(k, (combined.get(k) ?? 0) + p);
  const keys = [...combined.keys()];
  const byBits = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  if (keys.length <= COMPARE_SORTED_OUTCOMES) return keys.sort(byBits);
  return keys.sort((a, b) => combined.get(b)! - combined.get(a)! || byBits(a, b));
}

/** Total variation distance: half the summed difference over every outcome in either. 0 = identical, 1 = no overlap. */
export function totalVariationDistance(p: Distribution, q: Distribution): number {
  let sum = 0;
  for (const k of new Set([...Object.keys(p), ...Object.keys(q)])) sum += Math.abs((p[k] ?? 0) - (q[k] ?? 0));
  return sum / 2;
}

/** "Match to ideal": 1 minus the total variation distance from the ideal distribution, 0 to 1. */
export function matchToIdeal(measured: Distribution, ideal: Distribution): number {
  return Math.min(1, Math.max(0, 1 - totalVariationDistance(measured, ideal)));
}

/** 0.97412 -> "97.4%". */
export function formatMatch(match: number): string {
  return `${(match * 100).toFixed(1)}%`;
}
