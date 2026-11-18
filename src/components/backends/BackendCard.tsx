import TiltCard from "@/components/ui/TiltCard";
import { backendCondition, formatQueue, formatQueueTime } from "@/lib/backends/availability";
import { getQuantumBackendId } from "@/lib/quantum/backends";
import { isReservationCatalogId } from "@/lib/quantum/reservations";
import type { Backend } from "@/types/backend";
import BackendAvailabilityBadge from "./BackendAvailabilityBadge";
import BackendSpec from "./BackendSpec";
import BackendTypeTag from "./BackendTypeTag";

// A single backend card. Composes the smaller availability / spec / tag pieces
// inside an interactive TiltCard surface. The header shows availability (or a
// booking link for the reservation-only Cepheus QPU); live queue depth or
// predicted queue time show when the provider reports them. ID and full
// metrics live in the detail modal opened via onSelect.
export default function BackendCard({
  backend,
  onSelect,
}: {
  backend: Backend;
  onSelect?: (backend: Backend) => void;
}) {
  const { name, type, qubits, provider, queueDepth, queueTimeMs, noiseModel } = backend;
  // Providers that report a predicted queue time (IonQ) get their own row,
  // except while the backend is unavailable: no prediction applies then.
  const hasQueueTime = queueTimeMs !== undefined && !backendCondition(backend).blocked;
  // The reservation card is a real, bookable access path today even though
  // it has no QUANTUM_BACKENDS submission mapping of its own (see
  // reservations.ts) — it isn't "coming soon" like a genuinely unmapped card.
  const comingSoon =
    !isReservationCatalogId(backend.id) && getQuantumBackendId(backend.id) === null;

  return (
    <TiltCard
      onClick={onSelect ? () => onSelect(backend) : undefined}
      className={`flex h-full cursor-pointer flex-col gap-3 default-radius bg-gray-100 border border-gray-100 p-4 ${
        comingSoon ? "opacity-70" : "opacity-100"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-tight">{name}</h2>
        {comingSoon && (
          <span
            className="w-fit rounded px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: "var(--brand-tertiary)" }}
          >
            Coming soon
          </span>
        )}
        {!comingSoon && <BackendAvailabilityBadge backend={backend} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <BackendSpec label="Qubits" value={qubits} />
        <BackendSpec label="Provider" value={backend.providerLabel ?? provider} />
        {queueDepth !== null && (
          <BackendSpec label="Queue" value={formatQueue(queueDepth)} />
        )}
        {hasQueueTime && (
          <BackendSpec
            label="Predicted queue time"
            value={queueTimeMs === null ? "Unknown" : formatQueueTime(queueTimeMs)}
          />
        )}
        {noiseModel && <BackendSpec label="Noise model" value={noiseModel} />}
      </div>

      {type === "Simulator" && noiseModel && backend.details?.description && (
        <p className="text-xs leading-relaxed text-gray-600">{backend.details.description}</p>
      )}

      <div className="mt-auto flex items-center gap-2">
        <BackendTypeTag type={type} />
      </div>
    </TiltCard>
  );
}
