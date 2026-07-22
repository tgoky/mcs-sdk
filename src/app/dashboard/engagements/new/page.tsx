"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import type { FormData, Step, Testimonial } from "./types";

export default function NewEngagementPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("offer");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // ── Pre-flight validation gate ──
    const validationErrors = getValidationErrors(form);
    if (validationErrors.length > 0) {
      setError(`Cannot finish setup yet — ${validationErrors.length} requirement(s) missing. Scroll up to see the checklist.`);
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
      router.push(`/dashboard/runs/${data.runId}`);
    } catch (e: any) {
      setError(
        e.message === "Failed to fetch"
          ? "Couldn't reach the server. Check your connection and try again — nothing was set up yet."
          : e.message
      );
      setSubmitting(false);
    }
  }

  const allValidationErrors = getValidationErrors(form);

  return (
    <div className="space-y-6 w-full max-w-none px-1 transition-colors duration-200" style={{ color: "var(--text-secondary)" }}>
      {/* Header */}
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Set Up a New Client
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          A one-time setup. Connect their booking calendar and email tool, and teach the system their brand voice — everything below runs automatically after this.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {showRestoredBanner && (
        <div
          className="rounded-lg p-3 flex items-center justify-between gap-3 text-xs shadow-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            Restored your in-progress setup from before the last refresh. API keys were not saved and need to be re-entered.
          </span>
          <div className="flex items-center gap-2 shrink-0 font-mono">
            <button
              type="button"
              onClick={() => setShowRestoredBanner(false)}
              className="px-2 py-1 rounded hover:opacity-80 cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              [ Dismiss ]
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-2 py-1 rounded border bg-background/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              Start over
            </button>
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

        {step === "stack" && <StackStep form={form} set={set} setForm={setForm} />}

        {step === "credentials" && (
          <CredentialsStep
            form={form}
            set={set}
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
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === step);
            if (idx > 0) setStep(STEPS[idx - 1].id);
          }}
          disabled={step === "offer"}
          className="px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
        >
          Back
        </button>

        {step !== "confirm" ? (
          <button
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
            }}
            disabled={!isCurrentStepValid(form, step)}
            className="px-5 py-2 text-xs font-bold rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
          >
            Next
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || allValidationErrors.length > 0}
            className="px-5 py-2 text-xs font-bold rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
          >
            {submitting ? "Setting up..." : "Finish Setup"}
          </button>
        )}
      </div>
    </div>
  );
}
