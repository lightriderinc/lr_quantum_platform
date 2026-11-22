import type { BackendDetails } from "@/types/backend";

// Rigetti's own published figures for the real Cepheus-1-108Q QPU, for cards
// that can't read its live ISA (the mock card in ./client.ts today). The live
// card keeps reading the ISA; this is a dated snapshot, so refresh it when
// Rigetti updates its site.
//
// Sources, checked 2026-11-20:
// - Qubits, T1, T2, single-qubit and two-qubit (CZ) medians: the
//   "Rigetti Right Now" table on https://www.rigetti.com/ . The table updates
//   over time and states no "as of" date.
// - Chiplet layout: Rigetti's general-availability release, 2026-04-07
//   ("twelve interconnected 9-qubit chiplets"),
//   https://investors.rigetti.com/news-releases/news-release-details/rigetti-announces-general-availability-108-qubit-system
// - CZ as the two-qubit gate on chiplet systems:
//   https://www.rigetti.com/what-we-build
// - Native gate set, RZ(any angle), RX(multiples of pi/2), CZ, MEASURE:
//   pyQuil docs, "The Quil compiler",
//   https://pyquil-docs.rigetti.com/en/stable/compiler.html
//
// Rigetti publishes other two-qubit figures for this device: 99.1% at launch
// (what-we-build page and the April release) and 99.5% in its Q3 2026 results
// (2026-11-10, measurement method not stated). The home-page table is used
// because it is the one source that gives all four medians together, and its
// 107 qubits match the live ISA's node count (the "108Q" name is nominal).
//
// T2: the home page doesn't name the method. The live card maps the ISA's
// FreeInductionDecay T2 (a Ramsey measurement) to medianT2RamseyUs, so this
// does the same. Readout fidelity and T2 echo aren't published, so they're
// left out rather than guessed.
export interface PublishedSpecs {
  /** When the sources above were last read (YYYY-MM-DD). */
  checkedOn: string;
  qubits: number;
  details: BackendDetails;
}

export const CEPHEUS_1_108Q_PUBLISHED_SPECS: PublishedSpecs = {
  checkedOn: "2026-11-20",
  qubits: 107,
  details: {
    topology: "12 interconnected 9-qubit chiplets",
    nativeGates: ["RX", "RZ", "CZ", "MEASURE"],
    medianOneQubitFidelity: 99.84,
    medianTwoQubitFidelity: 98.67,
    medianT1Us: 27,
    medianT2RamseyUs: 10,
  },
};
