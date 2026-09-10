"use client";

// src/app/dashboard/engagements/[id]/win-back-manual-enroll-modal.tsx
//
// Same two-step preview-then-confirm shape as pile-on-manual-enroll-modal.tsx
// — see that file's header for the general reasoning. One real difference:
// no force override here. An existing active win-back enrollment for this
// exact prospect is a hard stop (see previewManualWinBackEnrollment's own
// comment in chat-winback.ts) — enrolling again would mean two live
// recovery cadences messaging the same person, not something a checkbox
// should be able to wave through.

import { useState } from "react";
import { Mail, User, Loader2, CheckCircle2, X as XIcon, ArrowRight } from "lucide-react";
import { Modal } from "@/components/modal";

type Step = "input" | "previewing" | "previewed" | "submitting" | "done";

export function WinBackManualEnrollModal({
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
  const [previewActions, setPreviewActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(prospectEmail.trim());

  function resetToInput() {
    setStep("input");
    setPreviewActions([]);
    setError(null);
  }

  async function runPreview() {
    setError(null);
    setStep("previewing");
    try {
      const res = await fetch(`/api/engagements/${engagementId}/win-back-pipeline/manual-enroll?prospectEmail=${encodeURIComponent(prospectEmail.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Preview failed.");
      setPreviewActions(body.actions ?? []);
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
      const res = await fetch(`/api/engagements/${engagementId}/win-back-pipeline/manual-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectEmail: prospectEmail.trim(), prospectName: prospectName.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Enrollment failed.");
      setSuccessMessage(`Enrolled ${prospectEmail.trim()} in the win-back recovery cadence.`);
      setStep("done");
      onEnrolled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed.");
      setStep("previewed");
    }
  }

  return (
    <Modal title="Manually enroll in Win-Back" icon={Mail} onClose={onClose}>
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
              For a prospect who cancelled or no-showed outside a connected booking webhook, or whose recovery webhook failed. Adds them to the
              client&apos;s actual configured recovery list/workflow — a real action, not a simulation.
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

            {(step === "previewed" || step === "submitting") && previewActions.length > 0 && (
              <div className="space-y-2 surface-glass-1 rounded-xl p-3">
                <p className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-500">This is what would happen — nothing has been sent yet</p>
                <ul className="space-y-1.5">
                  {previewActions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
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
                  disabled={step === "submitting"}
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
