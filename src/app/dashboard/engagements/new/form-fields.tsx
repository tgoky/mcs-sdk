import type { Step } from "./types";

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  helpText?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <label
        className="text-xs font-semibold block"
        style={{ color: "var(--text-primary)" }}
      >
        {label}{" "}
        {required && (
          <span className="ml-0.5 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
            (REQUIRED)
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 shadow-xs"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      />
      {helpText && (
        <p
          className="text-[11px] font-normal leading-normal opacity-85"
          style={{ color: "var(--text-muted)" }}
        >
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
  return (
    <div className="space-y-1.5 w-full">
      <label
        className="text-xs font-semibold block"
        style={{ color: "var(--text-primary)" }}
      >
        {label}{" "}
        {required && (
          <span className="ml-0.5 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
            (REQUIRED)
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md px-3 py-1.5 text-sm focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background text-foreground">
            {o.label}
          </option>
        ))}
      </select>
      {helpText && (
        <p
          className="text-[11px] font-normal leading-normal opacity-85"
          style={{ color: "var(--text-muted)" }}
        >
          {helpText}
        </p>
      )}
    </div>
  );
}
