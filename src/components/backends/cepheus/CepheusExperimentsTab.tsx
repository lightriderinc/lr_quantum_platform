"use client";

import ExperimentsPageClient from "@/components/experiments/ExperimentsPageClient";
import InfoBox from "@/components/InfoBox";

export default function CepheusExperimentsTab({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return (
    <div className="flex flex-col">
      <p className="max-w-2xl text-sm leading-relaxed text-gray-600 mb-3">
        Run a quantum experiment on Rigetti Cepheus-1-108Q.
      </p>
      <div className="mb-8">
        <InfoBox>
          Experiments are use cases built for the topology and properties of
          this device. <br />
          <br />
          <span className="font-semibold text-blue-700">Note:</span> More
          experiments will be added over time.
        </InfoBox>
      </div>
      <ExperimentsPageClient isAuthenticated={isAuthenticated} />
    </div>
  );
}
