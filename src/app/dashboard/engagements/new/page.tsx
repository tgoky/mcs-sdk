"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("offer");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToLaunch, setReadyToLaunch] = useState<{ engagementId: string; buyerName: string } | null>(null);
  const [composioBanner, setComposioBanner] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const { showRestoredBanner, setShowRestoredBanner, discardDraft } = useDraftPersistence(
    form,
    step,
    setForm,
    setStep
  );

  const emailIntegrations = useEmailIntegrations(form, setForm);
  const smartPrefill = useSmartPrefill(setForm);

  // Landed back here after a Composio "Connect" (see credential-field.tsx)
  // — /api/composio/callback appends composio_connected=<provider> or
  // composio_error=<message> to this page's URL. Runs once on mount only:
  // this only ever matters right after that specific redirect, and the
  // URL cleanup below removes the params before any re-render could
  // re-trigger it anyway.
  useEffect(() => {
    const connected = searchParams.get("composio_connected");
    const composioError = searchParams.get("composio_error");
    if (!connected && !composioError) return;

    if (composioError) {
      // Deferred, not called directly here: a setState call synchronous
      // with the effect body itself is what react-hooks/set-state-in-effect
      // flags — the async branch just below already avoids this the same
      // way, since its setState calls only ever run inside the IIFE's
      // callback, never at the effect's top level.
      queueMicrotask(() => setComposioBanner({ kind: "error", message: composioError }));
    }

    if (connected) {
      (async () => {
        try {
          const res = await fetch(`/api/credential-vault?provider=${encodeURIComponent(connected)}`);
          if (res.ok) {
            const data = await res.json();
            const items: { id: string; createdAt: string }[] = data.items ?? [];
            if (items.length > 0) {
              const newest = [...items].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )[0];
              // Functional update: whichever slot(s) currently point at
              // this provider get the freshly-connected credential
              // selected automatically, so returning from Composio drops
              // the buyer straight into "reuse saved" with it pre-picked
              // instead of an extra manual dropdown step. Reads `f` fresh
              // rather than the `form` closure captured at mount, since
              // the draft-restore effect (useDraftPersistence) may not
              // have finished hydrating yet by the time this resolves.
              setForm((f) => {
                const next = { ...f };
                let changed = false;
                if (connected === "ghl_calendar") {
                  if (f.bookingPlatform === "ghl_calendar" || f.emailPlatform === "ghl" || f.smsPlatform === "ghl_sms") {
                    next.ghlCredentialVaultId = newest.id;
                    changed = true;
                  }
                } else {
                  if (f.bookingPlatform === connected) {
                    next.bookingCredentialVaultId = newest.id;
                    changed = true;
                  }
                  if (f.emailPlatform === connected) {
                    next.emailCredentialVaultId = newest.id;
                    changed = true;
                  }
                }
                return changed ? next : f;
              });
            }
          }
          setComposioBanner({ kind: "ok", message: `${connected} connected.` });
        } catch {
          setComposioBanner({
            kind: "error",
            message: `${connected} connected, but couldn't auto-select it here — pick it from "Reuse saved" instead.`,
          });
        }
      })();
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("composio_connected");
    url.searchParams.delete("composio_error");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setReadyToLaunch({ engagementId: data.engagementId, buyerName: form.buyerName });
      setSubmitting(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(
        message === "Failed to fetch"
          ? "Couldn't reach the server. Check your connection and try again — nothing was set up yet."
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
      {/* --- HYPER-MICRO TIGHT DOT GRID (exact match from app/dashboard/page.tsx) --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" 
        aria-hidden="true"
      />

      <div className="relative z-10 space-y-6 w-full max-w-none px-1">
        {/* Header */}
        <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Set Up a New Client
          </h1>
          <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
            A one-time setup. Connect their booking calendar and email tool, and teach the system their brand voice — saving takes you straight into picking which skills to turn on.
          </p>
        </div>

        <StepIndicator steps={STEPS} current={step} />

        {composioBanner && (
          <div
            className={`rounded-lg p-3 flex items-center justify-between gap-3 text-xs shadow-xs border ${
              composioBanner.kind === "ok"
                ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                : "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400"
            }`}
          >
            <span>{composioBanner.message}</span>
            <button
              type="button"
              onClick={() => setComposioBanner(null)}
              className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer font-mono"
            >
              [ Dismiss ]
            </button>
          </div>
        )}

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
                className="px-2 py-1 rounded-sm hover:opacity-80 cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                [ Keep Draft ]
              </button>
              <button
                type="button"
                onClick={() => {
                  discardDraft();
                  smartPrefill.resetPrefill();
                  emailIntegrations.resetIntegrations();
                }}
                className="px-2 py-1 rounded-sm border bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer font-bold"
              >
                [ Dismiss & Clear All ]
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

        {/* Navigation footer buttons — sticky so Back/Next stay visible without scrolling through the whole step */}
        <div
          className="sticky bottom-0 z-20 flex justify-between pt-4 pb-3 font-mono backdrop-blur-xs bg-white/95 dark:bg-black/95"
          style={{ borderTop: "1px solid var(--border)" }}
        >
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