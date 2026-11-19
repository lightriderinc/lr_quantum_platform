import { templateNameFor } from "@/lib/circuits/templates";
import { payloadToQasm3 } from "@/lib/composer/circuit";
import { canCancelOn } from "@/lib/quantum/backends";
import { CANCELLABLE_JOB_STATUSES, type JobDetail } from "@/types/job";

// What the job details (Jobs page popup, composer and submit popup results)
// show beyond status and times. Pure, so it's tested without rendering.

/** "0 credits", "1 credit", "1,250 credits"; null when unknown (shown as a dash). */
export function formatCreditsCharged(credits: number | null | undefined): string | null {
  if (credits == null || !Number.isFinite(credits)) return null;
  return `${credits.toLocaleString("en-US")} ${credits === 1 ? "credit" : "credits"}`;
}

/** Cancel shows only while the job waits to run, on a backend that supports it (IonQ). */
export function showCancel(backend: string | undefined, status: string): boolean {
  return CANCELLABLE_JOB_STATUSES.has(status) && canCancelOn(backend);
}

/** The circuit that ran: its template name for a preset job, and OpenQASM 3. Null when the job has no stored circuit. */
export function jobCircuit(circuit: JobDetail["circuit"]): { presetName: string | null; qasm: string } | null {
  if (!circuit || !Array.isArray(circuit.instructions) || typeof circuit.num_qubits !== "number") return null;
  return { presetName: templateNameFor(circuit.name), qasm: payloadToQasm3(circuit) };
}
