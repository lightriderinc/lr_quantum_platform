"use client";

import CopyButton from "@/components/ui/CopyButton";
import DownloadButton from "@/components/ui/DownloadButton";

// Read-only OpenQASM 3 for the current circuit, regenerated on every edit.
export default function QasmPanel({ qasm }: { qasm: string }) {
  return (
    <section className="flex min-w-0 flex-col default-radius border border-gray-100 bg-gray-50 p-4" aria-label="OpenQASM 3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">OpenQASM 3</h2>
        <div className="flex items-center gap-2">
          <CopyButton value={qasm} label="Copy" />
          <DownloadButton value={qasm} filename="circuit.qasm" mimeType="text/plain" label="Download" />
        </div>
      </div>
      <pre className="max-h-80 flex-1 overflow-auto default-radius border border-gray-100 bg-white p-3 font-mono text-xs leading-relaxed text-gray-700">
        {qasm}
      </pre>
    </section>
  );
}
