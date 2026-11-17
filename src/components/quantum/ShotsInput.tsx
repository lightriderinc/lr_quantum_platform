"use client";

import HintIcon from "@/components/HintIcon";
import { useState } from "react";

interface Props {
  value: number;
  /** The typed number, or NaN while the box is empty. Never corrected while typing. */
  onChange: (value: number) => void;
  /** Called on blur: the parent shows `error` from then on (useJobSubmission's checkShots). */
  onBlur?: () => void;
  /** Out-of-range message from useJobSubmission (shotsError), e.g. "Max 100,000 shots on IQM Garnet". Marks the field invalid. */
  error?: string | null;
}

/** Empty box: NaN, so the check reads "At least 1 shot". */
export function parseShots(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

// The box keeps exactly what was typed (an empty box, "2000" after deleting
// a digit, "2.5"); the shot count is checked on blur and on submit, not on
// every key. `value` is only the starting number; the box owns its text.
export default function ShotsInput({ value, onChange, onBlur, error }: Props) {
  const [text, setText] = useState(() => (Number.isNaN(value) ? "" : String(value)));

  return (
    <div>
      <label htmlFor="shots" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        Shots
        <HintIcon text="Number of times the circuit runs. More shots give more accurate results." />
      </label>
      <input
        id="shots"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseShots(e.target.value));
        }}
        onBlur={onBlur}
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
