"use client";

import { useIonqBackends } from "@/hooks/useIonqBackends";
import { useIqmBackends } from "@/hooks/useIqmBackends";
import { useRigettiBackends } from "@/hooks/useRigettiBackends";
import { getQuantumBackendId } from "@/lib/quantum/backends";

/**
 * Backends a job can be sent to (no "Coming soon" cards), from the same
 * hooks as the Backends page, with live status. Used by the composer (run
 * panel and qubit limit) and the submit popups; React Query shares one fetch
 * between them.
 */
export function useRunnableBackends() {
  const { data: iqm = [], isLoading: iqmLoading } = useIqmBackends();
  const { data: rigetti = [], isLoading: rigettiLoading } = useRigettiBackends();
  const { data: ionq = [], isLoading: ionqLoading } = useIonqBackends();
  return {
    runnable: [...iqm, ...rigetti, ...ionq].filter((b) => getQuantumBackendId(b.id) !== null),
    loading: iqmLoading || rigettiLoading || ionqLoading,
  };
}
