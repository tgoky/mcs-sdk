import { BOOKING_PLATFORM_LABELS, BRIEF_DESTINATION_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS } from "@/lib/copy";
import { STEPS } from "../constants";
import type { FormData, Step, ValidationError } from "../types";

export function ConfirmStep({
  form,
  allValidationErrors,
  setStep,
  error,
}: {
  form: FormData;
  allValidationErrors: ValidationError[];
  setStep: (step: Step) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-6 w-full">
      {/* Pre-Flight Checklist Display */}
      {allValidationErrors.length > 0 ? (
        <div
          className="rounded-lg p-4 space-y-3 font-mono border text-xs shadow-xs"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
              <span>⚠</span> Pre-Flight Setup Checklist ({allValidationErrors.length} item{allValidationErrors.length > 1 ? "s" : ""} remaining)
            </span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Some required fields are missing or incomplete. Jump back to the relevant step to complete them before finishing setup:
          </p>
          <div className="space-y-2 pt-1">
            {/* Group errors by step */}
            {(["offer", "stack", "credentials", "voice"] as Step[]).map((stepId) => {
              const stepErrors = allValidationErrors.filter((e) => e.step === stepId);
              if (stepErrors.length === 0) return null;
              const stepLabel = STEPS.find((s) => s.id === stepId)?.label ?? stepId;
              return (
                <div key={stepId} className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {stepLabel}
                  </span>
                  {stepErrors.map((err, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded border bg-background/60"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {err.issue}
                      </span>
                      <button
                        type="button"
                        onClick={() => setStep(err.step)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shrink-0 ml-3"
                      >
                        Jump to Step →
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg p-3 text-xs font-mono font-semibold flex items-center gap-2 border text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        >
          <span>✓</span> All pre-flight setup checks passed! You are ready to launch this client.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider font-mono" style={{ color: "var(--text-primary)" }}>Review your setup</h2>
        <div className="text-xs font-mono font-medium space-y-2 rounded-lg p-4 shadow-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {[
            ["Client Name", form.buyerName],
            ["Selling Asset", form.offerName],
            ["Price Baseline", form.offerPrice || "—"],
            ["Booking Calendar", BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform],
            ["Email Platform", EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform],
            ["Hosting Node", HOSTING_PLATFORM_LABELS[form.hostingPlatform] ?? form.hostingPlatform],
            ["Brief Delivery Channel", BRIEF_DESTINATION_LABELS[form.briefDestination] ?? form.briefDestination],
            ["Voice Corpus Size", `${form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words`],
            ["Questions Matrix", `${form.topCallQuestions.split("\n").filter(Boolean).length}`],
            ["Objections Logged", `${form.topObjections.split("\n").filter(Boolean).length}`],
            ["Social Proof Count", `${form.testimonials.filter((t) => t.name && t.role && t.quote).length}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between pb-1.5 last:pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs mt-2 font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {error}
        </p>
      )}
    </div>
  );
}
