// app/dashboard/engagements/new/form-fields.tsx

import { useState } from "react";
import type { Step } from "./types";
import { Dropdown } from "@/components/ui/dropdown";
import { Mail } from "lucide-react";

export function PlatformLogo({ provider }: { provider?: string }) {
  const [hasError, setHasError] = useState(false);

  if (!provider || provider === "none" || provider === "discover_from_docs" || hasError) {
    return <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-400" />;
  }

  return (
    <img
      src={`/logos/${provider}.png`}
      alt={`${provider} logo`}
      className="w-3.5 h-3.5 shrink-0 object-contain"
      onError={() => setHasError(true)}
    />
  );
}

export function StepIndicator({
  steps,
  current,
}: {
  steps: { id: Step; label: string }[];
  current: Step;
}) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  const progressPct = ((currentIdx + 1) / steps.length) * 100;

  return (
    <div className="space-y-3 select-none font-mono">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {steps[currentIdx].label.toUpperCase()}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          STEP {currentIdx + 1} OF {steps.length}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helpText,
  required,
  providerLogo,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  helpText?: string;
  required?: boolean;
  providerLogo?: string;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">
        <span className="inline-flex items-center gap-1.5">
          {providerLogo && <PlatformLogo provider={providerLogo} />}
          {label}
        </span>
        {required && (
          <span className="ml-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
            (REQUIRED)
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
      />
      {helpText && (
        <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">
          {helpText}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  helpText,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">
        {label}{" "}
        {required && (
          <span className="ml-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
            (REQUIRED)
          </span>
        )}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed resize-y"
      />
      {helpText && (
        <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">
          {helpText}
        </p>
      )}
    </div>
  );
}

export function SelectField({
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
  const items = options.map((o) => ({ key: o.value, label: o.label }));
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">
        <span className="inline-flex items-center gap-1.5">
          {value && <PlatformLogo provider={value} />}
          {label}
        </span>
        {required && (
          <span className="ml-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
            (REQUIRED)
          </span>
        )}
      </label>
      <Dropdown
        items={items}
        selectedKey={value}
        onSelect={onChange}
        disabled={disabled}
        placeholder={selectedOption?.label ?? "Select option..."}
        triggerClassName="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 transition-colors shadow-xs hover:border-zinc-400 dark:hover:border-zinc-700"
        panelClassName="bg-background border border-border shadow-xl"
      />
      {helpText && (
        <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">
          {helpText}
        </p>
      )}
    </div>
  );
}