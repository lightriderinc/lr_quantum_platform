import DashboardUpdateCard from "./DashboardUpdateCard";

type Update = Parameters<typeof DashboardUpdateCard>[0];

/** Newest first. Only the newest MAX_UPDATES are shown. */
const UPDATES: Update[] = [
  {
    href: "/backends",
    color: "indigo",
    date: "2026-11-16",
    title: "IonQ Forte now available",
    description:
      "Run circuits on IonQ's trapped-ion Forte quantum computers and the Forte noisy simulator, with live status, calibration data and per-job pricing.",
  },
  {
    href: "/composer",
    color: "fuchsia",
    date: "2026-11-16",
    title: "New circuit composer",
    description:
      "Build circuits by dragging gates, preview outcomes instantly, and run them on any backend. Start from a Bell pair or GHZ template.",
  },
  {
    href: "/backends/rigetti-cepheus-1-108q?tab=experiments",
    color: "lime",
    date: "2026-09-15",
    title: "Experiments available on Rigetti Cepheus-1-108Q",
    description:
      "Ready-made experiments that show what the device can do and how to use it.",
  },
  {
    href: "/backends/rigetti-cepheus-1-108q",
    color: "purple",
    date: "2026-08-27",
    title: "Rigetti Cepheus-1-108Q Live",
    description: "Rigetti's 108-qubit quantum processor is now available on the platform and SDK.",
  },
];

const MAX_UPDATES = 3;

export default function DashboardUpdatesSection() {
  return (
    <div className="border-2 border-gray-50 p-4 mb-8">
      <h2 className="text-lg font-semibold text-gray-400 mb-4 inline-flex items-center gap-2">
        Platform updates
        {/* <FaStarOfLife className="text-sm text-gray-200" /> */}
      </h2>
      <div className="flex flex-col gap-2">
        {UPDATES.slice(0, MAX_UPDATES).map((u) => (
          <DashboardUpdateCard key={u.title} {...u} />
        ))}
      </div>
    </div>
  );
}
