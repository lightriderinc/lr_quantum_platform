export type JobStatus = "PENDING" | "WAITING" | "PROCESSING" | "COMPLETED" | "FAILED" | "ABORTED" | "CANCELLED";

/** Statuses a job never leaves. */
export const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set(["COMPLETED", "FAILED", "ABORTED", "CANCELLED"]);

/** Still waiting to run: the only time a Cancel button shows. */
export const CANCELLABLE_JOB_STATUSES: ReadonlySet<string> = new Set(["PENDING", "WAITING"]);

// Shape returned by GET /jobs (list)
export interface Job {
  uuid: string;
  gate?: string;
  backend?: string;
  shots?: number;
  status: JobStatus;
  created_at?: string;
  finished_at?: string;
}

// Shape returned by GET /jobs/{id} (detail)
export interface JobDetail {
  id: string;
  kind?: string;
  status: JobStatus;
  createdAt?: string;
  finishedAt?: string;
  /** Our own persisted QuantumJobSubmission.createdAt — see jobs/[id]/route.ts. */
  persistedCreatedAt?: string;
  isInTerminalState?: boolean;
  quantumComputer?: {
    alias: string;
    displayName: string;
  };
  /** Why the job failed, from qpu-proxy's GET /jobs/{uuid} (e.g. IonQ's own failure message). Only on failed jobs. */
  error?: string;
  /** The lr-circuit/v1 payload as submitted (our job row); null for jobs from before it was stored. */
  circuit?: { name?: string; num_qubits: number; num_clbits?: number; instructions: { name: string; qubits: number[]; clbits?: number[]; params?: number[] }[] } | null;
  /** Credits charged for this job (our job row's costCents); 0 on free simulators. */
  creditsCharged?: number;
}

export type MeasurementCounts = Record<string, number>;
