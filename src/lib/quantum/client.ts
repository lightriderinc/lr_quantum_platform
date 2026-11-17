import { QUANTUM_BACKENDS, type QuantumBackendId } from "@/lib/quantum/backends";
import type { JobDetail, JobStatus, MeasurementCounts } from "@/types/job";

export interface QuantumCircuitInstruction {
  name: string;
  qubits: number[];
  clbits?: number[];
  /** Angles in radians (RX, RY, RZ). */
  params?: number[];
}

/**
 * The circuit /api/lr/quantum/submit forwards to qpu-proxy: lr-circuit/v1,
 * the Light Rider SDK's payload. The presets below send only the required
 * fields; the composer sends the full form (format, name, num_clbits).
 */
export interface QuantumCircuitPayload {
  format?: "lr-circuit/v1";
  name?: string;
  num_qubits: number;
  num_clbits?: number;
  instructions: QuantumCircuitInstruction[];
}

// Ready-made circuits (the old "h"/"bell" presets among them) live in
// lib/circuits/templates.ts.

async function parseErrorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.message ?? data.error ?? `HTTP ${res.status}`;
}

export interface QuantumJobHandle {
  uuid: string;
  // iqm-proxy's submit response doesn't always echo a status, so callers
  // that need one (e.g. to seed a Job record) should default it themselves.
  status?: JobStatus;
}

function normalizeJob(data: Record<string, unknown>): QuantumJobHandle {
  return {
    uuid: (data.job_uuid ?? data.uuid ?? data.id) as string,
    status: data.status as JobStatus | undefined,
  };
}

/** The server re-quoted a per-job priced (IonQ Forte) job higher than the price the user confirmed. Nothing was charged or sent. */
export class PriceChangedError extends Error {
  constructor(
    public priceCredits: number,
    message: string,
  ) {
    super(message);
    this.name = "PriceChangedError";
  }
}

/**
 * The server wants a confirmed price before running this job: a backend that
 * isn't priced per job normally but has a price set right now (the IonQ
 * noisy simulator with IONQ_NOISY_SIM_PRICE_PER_SHOT_USD above 0). Nothing
 * was charged or sent; show the price and resubmit with it.
 */
export class PriceConfirmationRequiredError extends Error {
  constructor(
    public priceCredits: number,
    public balanceCredits: number | null,
    message: string,
  ) {
    super(message);
    this.name = "PriceConfirmationRequiredError";
  }
}

export interface JobPriceQuote {
  priceCredits: number;
  /** IonQ's minimum charge per job, in credits (Forte only); absent or null when unknown. */
  minimumCredits?: number | null;
  balanceCredits: number;
}

/** The credit price of one job on a per-job priced backend (IonQ Forte), before submitting it. Charges nothing. */
export async function fetchJobPrice(
  backend: QuantumBackendId,
  circuit: QuantumCircuitPayload,
  shots: number,
): Promise<JobPriceQuote> {
  const res = await fetch("/api/lr/quantum/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backend, circuit, shots }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return res.json();
}

export class BackendBusyError extends Error {
  constructor(public nextAvailableAt: string, deviceLabel: string) {
    super(
      `${deviceLabel} is busy. Next available at ${new Date(nextAvailableAt).toLocaleString()}.`,
    );
    this.name = "BackendBusyError";
  }
}

/**
 * Submits via the caller's own Logto session — same-origin fetch() carries
 * session cookies automatically, so no API key is needed for in-app calls.
 * (External SDK/Colab callers use the same route with a bearer key instead;
 * see resolveCustomerFromRequest.)
 */
export async function submitQuantumJob(
  backend: QuantumBackendId,
  circuit: QuantumCircuitPayload,
  shots: number,
  /** Required for per-job priced backends (IonQ Forte): the price the user confirmed. The server charges its own re-quote, never more than this. */
  confirmedPriceCredits?: number,
): Promise<QuantumJobHandle> {
  const res = await fetch("/api/lr/quantum/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      confirmedPriceCredits === undefined
        ? { backend, circuit, shots }
        : { backend, circuit, shots, confirmedPriceCredits },
    ),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (data.error === "price_changed" && typeof data.priceCredits === "number") {
      throw new PriceChangedError(data.priceCredits, data.message ?? "The price changed.");
    }
    if (data.error === "price_confirmation_required" && typeof data.priceCredits === "number") {
      throw new PriceConfirmationRequiredError(
        data.priceCredits,
        typeof data.balanceCredits === "number" ? data.balanceCredits : null,
        data.message ?? "Confirm the price to submit this job.",
      );
    }
    throw new Error(data.message ?? data.error ?? "HTTP 409");
  }
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    if (data.error === "busy" && typeof data.nextAvailableAt === "string") {
      const label = backend === "rigetti-cepheus" ? "Rigetti Cepheus-1-108Q" : QUANTUM_BACKENDS[backend].deviceInstance;
      throw new BackendBusyError(data.nextAvailableAt, label);
    }
  }
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return normalizeJob(await res.json());
}

export async function fetchQuantumJobDetail(jobId: string): Promise<JobDetail> {
  const res = await fetch(`/api/lr/quantum/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return res.json();
}

export async function fetchQuantumJobResult(jobId: string): Promise<MeasurementCounts | null> {
  const res = await fetch(`/api/lr/quantum/jobs/${jobId}/result`);
  if (res.status === 409) return null;
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const data = await res.json();
  return data.counts ?? data.measurement_counts ?? data;
}
