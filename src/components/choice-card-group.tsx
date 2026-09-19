"use client";

// Phase 3's "Choice cards" (see the "Worker Onboarding & Gating: Plan"
// doc's Worker Dossier section): "platform-choice fields become tappable
// tiles with icons, not <select> dropdowns." Deliberately the exact same
// prop signature as form-fields.tsx's SelectField — a drop-in
// replacement wherever a caller wants it, not a new form-state pattern.
// Reuses PlatformLogo (form-fields.tsx) for icons instead of inventing a
// second icon system — the same /logos/{provider}.png assets every
// SelectField already renders next to its own label.

import { PlatformLogo } from "@/app/dashboard/engagements/new/form-fields";

export function ChoiceCardGroup({
  label,
  value,
  onChange,
  options,
  helpText,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">
        {label}
        {required && (
          <span className="ml-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">(REQUIRED)</span>
        )}
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                selected
                  ? "border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              <PlatformLogo provider={option.value} />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {helpText && <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">{helpText}</p>}
    </div>
  );
}
