// app/dashboard/engagements/new/page.tsx
"use client";

import { useState } from "react";
import { RotateCcw, Trash2, Check } from "lucide-react";
import { STEPS, DEFAULT_FORM } from "./constants";
import { clearDraft, deleteServerDraft } from "./draft-storage";
import { useDraftPersistence } from "./use-draft-persistence";
import { useEmailIntegrations } from "./use-email-integrations";
import { useSmartPrefill } from "./use-smart-prefill";
import { getValidationErrors, isCurrentStepValid } from "./validation";
import { buildEngagementPayload } from "./submit-payload";
import { StepIndicator } from "./form-fields";
import { OfferStep } from "./steps/offer-step";
import { StackStep } from "./steps/stack-step";
import { CredentialsStep } from "./steps/credentials-step";
import { VoiceStep } from "./steps/voice-step";
import { ConfirmStep } from "./steps/confirm-step";
import { LaunchStep } from "./steps/launch-step";
import type { FormData, Step, Testimonial } from "./types";

export default function NewEngagementPage() {
  const [step, setStep] = useState<Step>("offer");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToLaunch, setReadyToLaunch] = useState<{ engagementId: string; buyerName: string } | null>(null);

  const { showRestoredBanner, setShowRestoredBanner, discardDraft } = useDraftPersistence(
    form,
    step,
    setForm,
    setStep
  );
  const emailIntegrations = useEmailIntegrations(form, setForm);
  const smartPrefill = useSmartPrefill(setForm);

  function set(field: keyof FormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addTestimonial() {
    setForm((f) => ({
      ...f,
      testimonials: [
        ...f.testimonials,
        { name: "", role: "", company: "", quote: "" },
      ],
    }));
  }

  function updateTestimonial(index: number, field: keyof Testimonial, value: string) {
    setForm((f) => ({
      ...f,
      testimonials: f.testimonials.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  function removeTestimonial(index: number) {
    setForm((f) => ({
      ...f,
      testimonials: f.testimonials.filter((_, i) => i !== index),
    }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    const validationErrors = getValidationErrors(form);
    if (validationErrors.length > 0) {
      setError(`Cannot finish setup yet—${validationErrors.length} requirement(s) missing. Scroll up to see the checklist.`);
      setSubmitting(false);
      return;
    }

    const payload = buildEngagementPayload(form);

    try {
      const res = await fetch("/api/engagements/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Setup failed. Check the fields and try again.");
        setSubmitting(false);
        return;
      }

      clearDraft();
      deleteServerDraft();
      setReadyToLaunch({ engagementId: data.engagementId, buyerName: form.buyerName });
      setSubmitting(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(
        message === "Failed to fetch"
          ? "Couldn't reach the server. Check your connection and try again—nothing was set up yet."
          : message
      );
      setSubmitting(false);
    }
  }

  const allValidationErrors = getValidationErrors(form);

  if (readyToLaunch) {
    return (
      <LaunchStep
        engagementId={readyToLaunch.engagementId}
        buyerName={readyToLaunch.buyerName}
        onBack={() => setReadyToLaunch(null)}
      />
    );
  }

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      {/* Hyper-micro tight dot grid background */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.5px,transparent_0.5px)] dark:bg-[radial-gradient(#3f3f46_0.5px,transparent_0.5px)] [background-size:6px_6px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_50%,transparent_100%)] opacity-70"
        aria-hidden="true"
      />

      <div className="relative z-10 space-y-6 w-full max-w-none px-1">
        {/* Header */}
        <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Set Up a New Client
          </h1>
          <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
            A one-time setup. Connect their booking calendar and email tool, and teach the system their brand voice—you&apos;ll get a chance to launch separately once everything&apos;s saved.
          </p>
        </div>

        <StepIndicator steps={STEPS} current={step} />

        {/* --- REVAMPED GLASSMOPHIC DRAFT RESTORE BANNER --- */}
        {showRestoredBanner && (
          <div className="relative overflow-hidden rounded-2xl p-4 transition-all duration-300 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-400/10 dark:via-amber-400/5 border border-amber-500/30 dark:border-amber-400/20 backdrop-blur-xl shadow-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20 shadow-inner">
                  <RotateCcw className="w-4 h-4 animate-spin-once" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 font-mono">
                      Restored In-Progress Setup
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-medium">
                      Auto-saved
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
                    Restored your form state from before the last refresh. API keys were excluded for security and need to be re-entered.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end font-mono">
                <button
                  type="button"
                  onClick={() => setShowRestoredBanner(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/80 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Keep Draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    discardDraft();
                    smartPrefill.resetPrefill();
                    emailIntegrations.resetIntegrations();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Discard & Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-transparent space-y-6 pt-2">
          {step === "offer" && (
            <OfferStep
              form={form}
              set={set}
              prefillDomain={smartPrefill.prefillDomain}
              setPrefillDomain={smartPrefill.setPrefillDomain}
              prefillLoading={smartPrefill.prefillLoading}
              prefillError={smartPrefill.prefillError}
              prefillNotes={smartPrefill.prefillNotes}
              runSmartPrefill={smartPrefill.runSmartPrefill}
            />
          )}

          {step === "stack" && <StackStep form={form} set={set} />}

          {step === "credentials" && (
            <CredentialsStep
              form={form}
              set={set}
              bookingOptions={emailIntegrations.bookingOptions}
              fetchingBookingOptions={emailIntegrations.fetchingBookingOptions}
              bookingOptionsError={emailIntegrations.bookingOptionsError}
              klaviyoLists={emailIntegrations.klaviyoLists}
              fetchingLists={emailIntegrations.fetchingLists}
              listsFetchError={emailIntegrations.listsFetchError}
              klaviyoMissingKeyMessage={emailIntegrations.klaviyoMissingKeyMessage}
              acLists={emailIntegrations.acLists}
              fetchingAcLists={emailIntegrations.fetchingAcLists}
              acListsError={emailIntegrations.acListsError}
              ghlLocations={emailIntegrations.ghlLocations}
              fetchingGhlLocations={emailIntegrations.fetchingGhlLocations}
              ghlLocationsError={emailIntegrations.ghlLocationsError}
              ghlWorkflows={emailIntegrations.ghlWorkflows}
              fetchingGhlWorkflows={emailIntegrations.fetchingGhlWorkflows}
              ghlWorkflowsError={emailIntegrations.ghlWorkflowsError}
            />
          )}

          {step === "voice" && (
            <VoiceStep
              form={form}
              set={set}
              addTestimonial={addTestimonial}
              updateTestimonial={updateTestimonial}
              removeTestimonial={removeTestimonial}
            />
          )}

          {step === "confirm" && (
            <ConfirmStep
              form={form}
              allValidationErrors={allValidationErrors}
              setStep={setStep}
              error={error}
            />
          )}
        </div>

        {/* Navigation footer buttons */}
        <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx > 0) setStep(STEPS[idx - 1].id);
            }}
            disabled={step === "offer"}
            className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
          >
            Back
          </button>

          {step !== "confirm" ? (
            <button
              type="button"
              onClick={() => {
                const idx = STEPS.findIndex((s) => s.id === step);
                if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
              }}
              disabled={!isCurrentStepValid(form, step)}
              className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || allValidationErrors.length > 0}
              className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
            >
              {submitting ? "Saving..." : "Save Setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}