import { isPaidBackend, isValidBackend } from "@/lib/quantum/backends";

type Mode = "Mock run" | "Live" | "IonQ Cloud" | "Simulator";

// IonQ jobs say where they ran: the Forte QPUs and the Forte noise simulator
// run on IonQ Cloud; ionq:mock is IonQ's ideal simulator. IQM and Rigetti
// keep "Mock run" / "Live".
const IONQ_MODES: Partial<Record<string, Mode>> = {
  "ionq-simulator": "Simulator",
  "ionq-forte-1-simulator": "IonQ Cloud",
  "ionq-forte-1": "IonQ Cloud",
  "ionq-forte-enterprise-1": "IonQ Cloud",
};

/** "Mock run" for free/unlimited :mock backends, "Live" for real (credit-metered) hardware, IonQ as above. */
export function resolveMode(backend?: string): Mode | null {
  if (!backend || !isValidBackend(backend)) return null;
  const ionq = IONQ_MODES[backend];
  if (ionq) return ionq;
  // isPaidBackend, not costPerShotCents === 0: per-job priced IonQ Forte QPUs
  // have costPerShotCents 0 but are real hardware.
  return isPaidBackend(backend) ? "Live" : "Mock run";
}

// Small pill marking whether a job ran on a free mock backend or real
// (credit-metered) hardware — same visual convention as BackendTypeTag.
export default function JobModeTag({ backend }: { backend?: string }) {
  const mode = resolveMode(backend);
  if (!mode) return null;

  return (
    <span className="rounded bg-zinc-600 px-2.5 py-0.5 text-xs font-medium text-white">
      {mode}
    </span>
  );
}
