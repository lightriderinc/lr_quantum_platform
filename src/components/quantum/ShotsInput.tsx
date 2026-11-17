"use client";

import HintIcon from "@/components/HintIcon";

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Out-of-range message from useJobSubmission (shotsError), e.g. "Max 100,000 shots on IQM Garnet". Marks the field invalid. */
  error?: string | null;
}

export default function ShotsInput({ value, onChange, error }: Props) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        Shots
        <HintIcon text="Number of times the circuit runs. More shots give more accurate results." />
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        min={1}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "shots-error" : undefined}
        className={`default-radius w-full border px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 ${
          error ? "border-red-400 focus:ring-red-300" : "border-gray-100 focus:ring-gray-300"
        }`}
      />
      {error && (
        <p id="shots-error" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
