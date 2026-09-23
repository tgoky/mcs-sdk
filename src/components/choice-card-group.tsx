"use client";

// Tappable tiles for a platform or mode choice, in place of a <select>.
// Same props as form-fields.tsx's SelectField, so either drops in.
//
// The tiles size to the space they're in (container queries), not the
// window: these forms open in narrow side panels as often as full pages,
// and a three-across grid in a 360px panel cut every label to an icon.
// Labels wrap instead of truncating, and a logo is shown only for a real
// brand; a choice like "None" or "Slack channel" used to get a generic
// envelope.

import { Check } from "lucide-react";
import { PlatformLogo, hasPlatformLogo } from "@/components/platform-logo";
import { cn } from "@/lib/utils";

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
    <div className="@container w-full space-y-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">Required</span>}
      </p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 @xs:grid-cols-2 @xl:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          const logo = option.value && hasPlatformLogo(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "border-[var(--ink)] bg-[var(--accent-dim)] text-[var(--text-primary)] ring-1 ring-[var(--ink)]"
                  : "bg-background text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
              )}
            >
              {logo && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/10">
                  <PlatformLogo provider={option.value} size={14} monogram={option.label} />
                </span>
              )}
              <span className="min-w-0 flex-1 leading-snug">{option.label}</span>
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--ink-foreground)]" : "border-[var(--text-muted)]/50"
                )}
                aria-hidden="true"
              >
                {selected && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
              </span>
            </button>
          );
        })}
      </div>
      {helpText && <p className="text-xs leading-relaxed text-[var(--text-muted)]">{helpText}</p>}
    </div>
  );
}
