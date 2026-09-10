"use client";

// src/app/dashboard/engagements/[id]/pile-on-manual-enroll-modal.tsx
//
// Dashboard UI for the same preview_pile_on_enrollment / enroll_in_pile_on
// pair already wired into Teammates chat (chat-pile-on.ts) — this modal
// calls the exact same two functions through
// /api/engagements/[id]/pile-on-pipeline/manual-enroll, so a duplicate-
// booking refusal, a missing-credential error, or the win-back-exit note
// reads identically here and in chat. Deliberately opened from the same
// page an operator already visits to see this client's Pile-On pipeline
// (skills/pile-on/page.tsx) rather than a new, separate screen — see that
// page's PileOnPipeline toolbar for the trigger button.
//
// Two-step flow, not a single "Enroll" button: preview is always shown
// before the real action can be taken, mirroring the chat system prompt's
// own rule ("ALWAYS call preview_pile_on_enrollment first"). The force
// checkbox only appears once a warning (typically an existing booking on
// file) actually exists, and enabling it is the one thing that turns a
// refusal into an explicit "yes, do it anyway."

import { useState } from "react";
import { Mail, User, Loader2, CheckCircle2, AlertTriangle, X as XIcon, ArrowRight } from "lucide-react";
import { Modal } from "@/components/modal";

type PreviewState = { actions: string[]; warnings: string[] } | null;
type Step = "input" | "previewing" | "previewed" | "submitting" | "done";

export function PileOnManualEnrollModal({
  engagementId,
  onClose,
  onEnrolled,
}: {
  engagementId: string;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [acknowledgeWarning, setAcknowledgeWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(prospectEmail.trim());

  async function runPreview() {
    setError(null);
    setStep("previewing");
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pile-on-pipeline/manual-enroll?prospectEmail=${encodeURIComponent(prospectEmail.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Preview failed.");
      setPreview({ actions: body.actions ?? [], warnings: body.warnings ?? [] });
      setAcknowledgeWarning(false);
      setStep("previewed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
      setStep("input");
    }
  }

  async function confirmEnroll() {
    setError(null);
    setStep("submitting");
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pile-on-pipeline/manual-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectEmail: prospectEmail.trim(),
          prospectName: prospectName.trim() || undefined,
          force: acknowledgeWarning,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Enrollment failed.");
      setSuccessMessage(
        `Enrolled ${prospectEmail.trim()} in the Pile-On pre-call sequence.${body.rebookedFromWinBack ? " Also exited them from their active win-back cadence." : ""}`
      );
      setStep("done");
      onEnrolled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed.");
      setStep("previewed");
    }
  }

  function resetToInput() {
    setStep("input");
    setPreview(null);
    setAcknowledgeWarning(false);
    setError(null);
  }

  return (
    <Modal title="Manually enroll in Pile-On" icon={Mail} onClose={onClose}>
      <div className="space-y-4 font-sans">
        {step === "done" ? (
          <div className="space-y-3 py-2 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{successMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className="hover-lift press-settle shadow-elevation-1 mt-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              For a prospect who booked outside a connected booking webhook, or whose enrollment webhook failed. Only enrolls their pre-call email
              sequence — never SMS or an ad-data cohort sync (those need a real booking behind them).
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">Prospect email</label>
              <div className="relative">
                <Mail size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  value={prospectEmail}
                  onChange={(e) => {
                    setProspectEmail(e.target.value);
                    if (step !== "input") resetToInput();
                  }}
                  placeholder="jane@prospect.com"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
                  disabled={step === "previewing" || step === "submitting"}
                />
              </div>

              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block pt-1">Prospect name (optional)</label>
              <div className="relative">
                <User size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  value={prospectName}
                  onChange={(e) => {
                    setProspectName(e.target.value);
                    if (step === "previewed") resetToInput();
                  }}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
                  disabled={step === "previewing" || step === "submitting"}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <XIcon size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {(step === "previewed" || step === "submitting") && preview && (
              <div className="space-y-2 surface-glass-1 rounded-xl p-3">
                <p className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500">This is what would happen — nothing has been sent yet</p>
                <ul className="space-y-1.5">
                  {preview.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                {preview.warnings.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {preview.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                    <label className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledgeWarning}
                        onChange={(e) => setAcknowledgeWarning(e.target.checked)}
                        className="mt-0.5"
                        disabled={step === "submitting"}
                      />
                      <span>I understand this may be a duplicate — enroll anyway.</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="hover-lift press-settle rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                disabled={step === "previewing" || step === "submitting"}
              >
                Cancel
              </button>

              {step === "previewed" || step === "submitting" ? (
                <button
                  type="button"
                  onClick={confirmEnroll}
                  disabled={step === "submitting" || (preview !== null && preview.warnings.length > 0 && !acknowledgeWarning)}
                  className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {step === "submitting" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Confirm enrollment
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={!emailValid || step === "previewing"}
                  className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {step === "previewing" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  Preview
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
