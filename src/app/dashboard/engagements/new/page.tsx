"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_PLATFORM_LABELS,
  EMAIL_PLATFORM_LABELS,
  HOSTING_PLATFORM_LABELS,
  BRIEF_DESTINATION_LABELS,
} from "@/lib/copy";
import { stripDraftSecrets } from "@/lib/draft-fields";

type Step = "offer" | "credentials" | "stack" | "voice" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "offer", label: "Your Offer" },
  { id: "credentials", label: "Account Keys" },
  { id: "stack", label: "Connect Your Tools" },
  { id: "voice", label: "Your Brand Voice" },
  { id: "confirm", label: "Review & Finish" },
];

interface Testimonial {
  name: string;
  role: string;
  company: string;
  quote: string;
}

interface FormData {
  engagementId: string;
  buyerName: string;
  offerName: string;
  offerPrice: string;
  offerIcp: string;
  trafficTemperature: "cold" | "warm" | "hot";
  hybridMode: boolean;
  bookingPlatform: string;
  bookingLocationId: string;
  bookingStandingLink: string;

  recoveryAutomationId: string; 
  longTermNurtureListId: string;
  emailPlatform: string;
  emailTargetListId: string;
  emailRecoveryListId: string;
  emailActiveCampaignBaseUrl: string;
  emailGhlLocationId: string;
  emailGhlTargetWorkflowId: string;
  emailGhlRecoveryWorkflowId: string;
  // Custom SMTP — direct-send win-back email channel. Bundled into a
  // single JSON string (emailApiKey) at submit time rather than adding
  // new stack schema columns — see the useEffect that composes it below.
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromAddress: string;
  smtpFromName: string;
  hostingPlatform: string;
  publishDomain: string;
  hostingWebflowSiteId: string;
  hostingWebflowCollectionId: string;
  hostingWordpressSiteUrl: string;
  hostingVercelProjectName: string;
  hostingVercelTeamId: string;
  hostingApiKey: string;
  briefDestination: string;
  slackWebhookUrl: string;
  // Pile-On recovery gap 1 — SMS
  smsPlatform: string;
  smsApiKey: string;
  smsTwilioAccountSid: string;
  smsTwilioMessagingServiceSid: string;
  smsTwilioFromNumber: string;
  smsA2p10dlcStatus: string;
  smsComplianceFooterVariant: "standard" | "custom";
  smsComplianceFooterCustom: string;
  // Pile-On recovery gap 2 — ad-data cohort sync
  adDataPlatform: string;
  adDataApiKey: string;
  adDataHyrosAccountId: string;
  adDataGoogleSheetsSpreadsheetId: string;
  adDataGoogleSheetsSheetName: string;
  adDataCohortId: string;
  // Pile-On recovery gap 4 — existing-sequence audit
  existingPileOnSequenceFlagged: boolean;
  // Pre-Call Read recovery gap 1 — dynamic trigger
  briefTriggerType: "nightly" | "dynamic_webhook";
  // Pre-Call Read recovery gap 3 — video engagement
  videoEngagementPlatform: string;
  videoEngagementApiKey: string;
  heroVideoId: string;
  videoEngagementWistiaVideoId: string;
  videoEngagementYoutubeChannelId: string;
  // Pre-Call Read recovery gap 5 — Apollo/PDL BYOK
  prospectResearchSourcesUsed: string[];
  apolloApiKey: string;
  pdlApiKey: string;
  topCallQuestions: string;
  topObjections: string;
  prospectMeets: string;
  voiceSource: "scrape" | "manual";
  marketingDomain: string;
  rawVoiceCorpus: string;
  bookingApiKey: string;
  emailApiKey: string;
  testimonials: Testimonial[];
  // Pin-Down recovery gap 6 — populated when bookingPlatform or
  // hostingPlatform is "discover_from_docs".
  discoveredPlatformName: string;
  discoveredPlatformWebsite: string;
  // Pin-Down recovery gap 7 — set when the operator already knows the
  // buyer has a confirmation page live (or after running smart pre-fill,
  // gap 1, which can detect this automatically).
  existingConfirmationPageUrl: string;
  // Win-Back recovery gaps 3, 4, 6
  rescheduleMode: "fresh_link" | "time_slots";
  recoveredFromNoShowTaggingEnabled: boolean;
  inboundReplyMode: "native" | "forwarding" | "none";
  hubspotPortalId: string;
  // Leak Map recovery gaps 1, 2, 3, 4, 7
  weeklyScheduleDayOfWeek: number;
  weeklyScheduleHour: number;
  monthlyScheduleDayOfMonth: number;
  leakMapTimezone: string;
  auditOutputFormat: "email" | "slack" | "dashboard_only";
  leakMapReportEmail: string;
  existingAuditFlagged: boolean;
  existingAuditDescription: string;
  notificationPackSelections: string[];
  offerVertical: string;
}

const DEFAULT_FORM: FormData = {
  engagementId: "",
  buyerName: "",
  offerName: "",
  offerPrice: "",
  offerIcp: "",
  trafficTemperature: "warm",
  hybridMode: false,
  bookingPlatform: "calendly",
  bookingLocationId: "",
  bookingStandingLink: "",
  emailPlatform: "klaviyo",
  recoveryAutomationId: "",
  longTermNurtureListId: "",
  emailTargetListId: "",
  emailRecoveryListId: "",
  emailActiveCampaignBaseUrl: "",
  emailGhlLocationId: "",
  emailGhlTargetWorkflowId: "",
  emailGhlRecoveryWorkflowId: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  smtpFromAddress: "",
  smtpFromName: "",
  hostingPlatform: "nextjs_vercel",
  publishDomain: "",
  hostingWebflowSiteId: "",
  hostingWebflowCollectionId: "",
  hostingWordpressSiteUrl: "",
  hostingVercelProjectName: "",
  hostingVercelTeamId: "",
  hostingApiKey: "",
  briefDestination: "slack",
  slackWebhookUrl: "",
  smsPlatform: "none",
  smsApiKey: "",
  smsTwilioAccountSid: "",
  smsTwilioMessagingServiceSid: "",
  smsTwilioFromNumber: "",
  smsA2p10dlcStatus: "not_started",
  smsComplianceFooterVariant: "standard",
  smsComplianceFooterCustom: "",
  adDataPlatform: "none",
  adDataApiKey: "",
  adDataHyrosAccountId: "",
  adDataGoogleSheetsSpreadsheetId: "",
  adDataGoogleSheetsSheetName: "",
  adDataCohortId: "",
  existingPileOnSequenceFlagged: false,
  briefTriggerType: "nightly",
  videoEngagementPlatform: "none",
  videoEngagementApiKey: "",
  heroVideoId: "",
  videoEngagementWistiaVideoId: "",
  videoEngagementYoutubeChannelId: "",
  prospectResearchSourcesUsed: [],
  apolloApiKey: "",
  pdlApiKey: "",
  topCallQuestions: "",
  topObjections: "",
  prospectMeets: "founder",
  voiceSource: "scrape",
  marketingDomain: "",
  rawVoiceCorpus: "",
  bookingApiKey: "",
  emailApiKey: "",
  testimonials: [],
  discoveredPlatformName: "",
  discoveredPlatformWebsite: "",
  existingConfirmationPageUrl: "",
  rescheduleMode: "time_slots",
  recoveredFromNoShowTaggingEnabled: true,
  inboundReplyMode: "none",
  hubspotPortalId: "",
  weeklyScheduleDayOfWeek: 1,
  weeklyScheduleHour: 9,
  monthlyScheduleDayOfMonth: 1,
  leakMapTimezone: "UTC",
  auditOutputFormat: "dashboard_only",
  leakMapReportEmail: "",
  existingAuditFlagged: false,
  existingAuditDescription: "",
  notificationPackSelections: [],
  offerVertical: "",
};

// Draft persistence: survives page refresh / accidental navigation within
// the same tab. Deliberately session-scoped (not localStorage) and
// deliberately excludes API keys — secrets never touch browser storage,
// even short-lived storage, so those three fields always come back empty
// after a restore and the buyer re-pastes them.
const DRAFT_KEY = "mcs:new-engagement:draft";
const DRAFT_STEP_KEY = "mcs:new-engagement:step";

function loadDraft(): FormData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Merge onto DEFAULT_FORM shape so a draft saved before a schema change
    // (new field added/removed) can't leave the form in a half-shaped state.
    return { ...DEFAULT_FORM, ...parsed };
  } catch {
    return null;
  }
}

function loadDraftStep(): Step | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STEP_KEY);
    return raw && STEPS.some((s) => s.id === raw) ? (raw as Step) : null;
  } catch {
    return null;
  }
}

function saveDraft(form: FormData, step: Step) {
  if (typeof window === "undefined") return;
  try {
    const { bookingApiKey, emailApiKey, hostingApiKey, smsApiKey, adDataApiKey, videoEngagementApiKey, apolloApiKey, pdlApiKey, ...safeToStore } = form;
    void bookingApiKey;
    void emailApiKey;
    void hostingApiKey;
    void smsApiKey;
    void adDataApiKey;
    void videoEngagementApiKey;
    void apolloApiKey;
    void pdlApiKey;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safeToStore));
    window.sessionStorage.setItem(DRAFT_STEP_KEY, step);
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded edge
    // cases — losing draft persistence isn't worth surfacing an error over.
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(DRAFT_STEP_KEY);
  } catch {
    // no-op
  }
}

// ── Server-side draft backup ────────────────────────────────────────────
// sessionStorage above only survives a same-tab refresh — it's wiped the
// instant the tab/app/embedded frame closes, with no warning. These three
// calls back that up with a real database row (see
// src/app/api/engagements/draft/route.ts) so closing out mid-wizard and
// coming back later still has something to restore. Fire-and-forget by
// design: a failed background sync shouldn't interrupt someone filling out
// a form, and sessionStorage still covers the common same-tab case even if
// these calls never landed.

async function fetchServerDraft(): Promise<{ step: Step; formData: Partial<FormData> } | null> {
  try {
    const res = await fetch("/api/engagements/draft");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.draft) return null;
    const step: Step = STEPS.some((s) => s.id === data.draft.step)
      ? data.draft.step
      : "offer";
    return { step, formData: data.draft.formData ?? {} };
  } catch {
    return null;
  }
}

function pushServerDraft(form: FormData, step: Step) {
  const safeToStore = stripDraftSecrets(form);
  fetch("/api/engagements/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, formData: safeToStore }),
  }).catch(() => {
    // Best-effort — sessionStorage already has this tab's copy.
  });
}

function deleteServerDraft() {
  fetch("/api/engagements/draft", { method: "DELETE" }).catch(() => {
    // Best-effort cleanup — an orphaned draft row just gets overwritten
    // by the next wizard session for this user, so a failure here is
    // harmless, not a stuck state.
  });
}

function StepIndicator({
  steps,
  current,
}: {
  steps: typeof STEPS;
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

function InputField({
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

function SelectField({
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

export default function NewEngagementPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(() => loadDraftStep() ?? "offer");
  const [form, setForm] = useState<FormData>(() => loadDraft() ?? DEFAULT_FORM);
  const [restoredDraft] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(DRAFT_KEY) !== null
  );
  const [showRestoredBanner, setShowRestoredBanner] = useState(restoredDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-draft hydration guard: don't start pushing autosaves to the
  // server until we've first checked whether a draft from a previous,
  // now-closed session is sitting there — otherwise the very first render
  // (form still at DEFAULT_FORM) would race ahead and overwrite it with
  // blanks before we ever got a chance to read it back.
  const [hasHydratedServerDraft, setHasHydratedServerDraft] = useState(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Klaviyo states
  const [klaviyoLists, setKlaviyoLists] = useState<{ id: string; name: string }[]>([]);
  const [fetchingLists, setFetchingLists] = useState(false);
  const [listsFetchError, setListsFetchError] = useState<string | null>(null);

  // ActiveCampaign states
  const [acLists, setAcLists] = useState<{ id: string; name: string }[]>([]);
  const [fetchingAcLists, setFetchingAcLists] = useState(false);
  const [acListsError, setAcListsError] = useState<string | null>(null);

  // GHL states
  const [ghlLocations, setGhlLocations] = useState<{ id: string; name: string }[]>([]);
  const [fetchingGhlLocations, setFetchingGhlLocations] = useState(false);
  const [ghlLocationsError, setGhlLocationsError] = useState<string | null>(null);
  const [ghlWorkflows, setGhlWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [fetchingGhlWorkflows, setFetchingGhlWorkflows] = useState(false);
  const [ghlWorkflowsError, setGhlWorkflowsError] = useState<string | null>(null);

  // Pin-Down recovery gap 1 — smart pre-fill
  const [prefillDomain, setPrefillDomain] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillNotes, setPrefillNotes] = useState<string[]>([]);

  async function runSmartPrefill() {
    if (!prefillDomain.trim()) return;
    setPrefillLoading(true);
    setPrefillError(null);
    setPrefillNotes([]);
    try {
      const res = await fetch("/api/pin-down/discovery-prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: prefillDomain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pre-fill failed.");
      const p = data.prefill as {
        suggestedBuyerName?: string;
        suggestedOfferName?: string;
        suggestedIcp?: string;
        existingConfirmationPageUrl?: string;
        detectedBookingPlatform?: string;
        notes: string[];
      };
      setForm((f) => ({
        ...f,
        buyerName: p.suggestedBuyerName || f.buyerName,
        offerName: p.suggestedOfferName || f.offerName,
        offerIcp: p.suggestedIcp || f.offerIcp,
        marketingDomain: prefillDomain,
        existingConfirmationPageUrl: p.existingConfirmationPageUrl || f.existingConfirmationPageUrl,
        bookingPlatform: p.detectedBookingPlatform || f.bookingPlatform,
      }));
      setPrefillNotes(p.notes ?? []);
    } catch (e: any) {
      setPrefillError(e.message);
    } finally {
      setPrefillLoading(false);
    }
  }

  function set(field: keyof FormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function discardDraft() {
    clearDraft();
    deleteServerDraft();
    setForm(DEFAULT_FORM);
    setStep("offer");
    setShowRestoredBanner(false);
  }

  // Server-draft hydration: this tab's sessionStorage was empty, which
  // means either this is a genuinely fresh wizard, or the operator started
  // one in a tab/app/frame that's since closed. Check the server-side
  // backup before anything else touches `form`. Skipped entirely when
  // sessionStorage already had something, since that's always the
  // freshest copy for this tab.
  useEffect(() => {
    let cancelled = false;
    if (restoredDraft) {
      setHasHydratedServerDraft(true);
      return;
    }
    (async () => {
      const serverDraft = await fetchServerDraft();
      if (!cancelled && serverDraft) {
        setForm((f) => ({ ...f, ...serverDraft.formData }));
        setStep(serverDraft.step);
        setShowRestoredBanner(true);
      }
      if (!cancelled) setHasHydratedServerDraft(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draft autosave: keeps onboarding progress across an accidental refresh
  // or back/forward navigation. API keys are stripped before storage inside
  // saveDraft, so nothing sensitive ends up in sessionStorage. The
  // sessionStorage write is synchronous and instant; the server push is
  // debounced 1.5s behind it — sessionStorage is the fast path for a
  // same-tab reload, the server row is the fallback for when the tab/app
  // itself closes and sessionStorage is gone before it can help.
  useEffect(() => {
    saveDraft(form, step);
    if (!hasHydratedServerDraft) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      pushServerDraft(form, step);
    }, 1500);
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [form, step, hasHydratedServerDraft]);

  // Narrow safety net for the ~1.5s window between an edit and the
  // debounced server push actually firing — sessionStorage already has
  // this tab's copy instantly, so this only matters if the tab/app closes
  // in that specific gap.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pushTimerRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Klaviyo: Fetch lists
  useEffect(() => {
    if (step === "stack" && form.emailPlatform === "klaviyo" && form.emailApiKey.trim()) {
      setFetchingLists(true);
      setListsFetchError(null);

      fetch(`/api/integrations/klaviyo/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: form.emailApiKey.trim() }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `Klaviyo request failed [${res.status}]`);
          }
          return data;
        })
        .then((data) => {
          if (data.success) {
            setKlaviyoLists(data.lists ?? []);
          } else {
            throw new Error(data.error ?? "API Resolution anomaly");
          }
        })
        .catch((err: any) => {
          console.error(err);
          setListsFetchError(err.message || "Could not retrieve profiles from Klaviyo. Please check your token scopes.");
        })
        .finally(() => {
          setFetchingLists(false);
        });
    }
  }, [step, form.emailPlatform, form.emailApiKey]);

  // ActiveCampaign: Fetch lists when base URL is provided
  useEffect(() => {
    if (
      step === "stack" &&
      form.emailPlatform === "activecampaign" &&
      form.emailApiKey.trim() &&
      form.emailActiveCampaignBaseUrl.trim()
    ) {
      setFetchingAcLists(true);
      setAcListsError(null);

      fetch(`/api/integrations/activecampaign/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.emailApiKey.trim(),
          baseUrl: form.emailActiveCampaignBaseUrl.trim(),
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `ActiveCampaign request failed [${res.status}]`);
          }
          return data;
        })
        .then((data) => {
          if (data.success) {
            setAcLists(data.lists ?? []);
          } else {
            throw new Error(data.error ?? "Unknown error");
          }
        })
        .catch((err: any) => {
          console.error(err);
          setAcListsError(err.message || "Could not retrieve ActiveCampaign lists.");
        })
        .finally(() => {
          setFetchingAcLists(false);
        });
    }
  }, [step, form.emailPlatform, form.emailApiKey, form.emailActiveCampaignBaseUrl]);

  // Custom SMTP: compose the JSON credential blob into emailApiKey (the
  // field that gets sent as credentials.email) whenever any SMTP field
  // changes. There's no separate "API key" for a raw mail transport —
  // this is what makes the existing single-string credential pipeline
  // (storeCredential/resolveCredential, the !form.emailApiKey required
  // check below) work for SMTP without changing that pipeline at all.
  useEffect(() => {
    if (form.emailPlatform !== "smtp") return;
    const required = [form.smtpHost, form.smtpPort, form.smtpUsername, form.smtpPassword, form.smtpFromAddress];
    if (required.some((v) => !v.trim())) {
      if (form.emailApiKey) setForm((f) => ({ ...f, emailApiKey: "" }));
      return;
    }
    const blob = JSON.stringify({
      host: form.smtpHost.trim(),
      port: Number(form.smtpPort),
      secure: form.smtpSecure,
      username: form.smtpUsername.trim(),
      password: form.smtpPassword,
      fromAddress: form.smtpFromAddress.trim(),
      fromName: form.smtpFromName.trim() || undefined,
    });
    if (blob !== form.emailApiKey) setForm((f) => ({ ...f, emailApiKey: blob }));
  }, [
    form.emailPlatform,
    form.smtpHost,
    form.smtpPort,
    form.smtpSecure,
    form.smtpUsername,
    form.smtpPassword,
    form.smtpFromAddress,
    form.smtpFromName,
    form.emailApiKey,
  ]);

  // GHL: Fetch locations
  useEffect(() => {
    if (step === "stack" && form.emailPlatform === "ghl" && form.emailApiKey.trim()) {
      setFetchingGhlLocations(true);
      setGhlLocationsError(null);
      setGhlWorkflows([]);
      setForm((f) => ({ ...f, emailGhlTargetWorkflowId: "", emailGhlRecoveryWorkflowId: "" }));

      fetch(`/api/integrations/ghl/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: form.emailApiKey.trim() }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `GHL request failed [${res.status}]`);
          }
          return data;
        })
        .then((data) => {
          if (data.success) {
            setGhlLocations(data.locations ?? []);
          } else {
            throw new Error(data.error ?? "Unknown error");
          }
        })
        .catch((err: any) => {
          console.error(err);
          setGhlLocationsError(err.message || "Could not retrieve GHL locations.");
        })
        .finally(() => {
          setFetchingGhlLocations(false);
        });
    }
  }, [step, form.emailPlatform, form.emailApiKey]);

  // GHL: Fetch workflows when location is selected
  useEffect(() => {
    if (
      form.emailPlatform === "ghl" &&
      form.emailGhlLocationId &&
      form.emailApiKey.trim()
    ) {
      setFetchingGhlWorkflows(true);
      setGhlWorkflowsError(null);

      fetch(`/api/integrations/ghl/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.emailApiKey.trim(),
          locationId: form.emailGhlLocationId,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `GHL request failed [${res.status}]`);
          }
          return data;
        })
        .then((data) => {
          if (data.success) {
            setGhlWorkflows(data.workflows ?? []);
          } else {
            throw new Error(data.error ?? "Unknown error");
          }
        })
        .catch((err: any) => {
          console.error(err);
          setGhlWorkflowsError(err.message || "Could not retrieve GHL workflows.");
        })
        .finally(() => {
          setFetchingGhlWorkflows(false);
        });
    }
  }, [form.emailPlatform, form.emailGhlLocationId, form.emailApiKey]);

  // Derived parameter layer
  const klaviyoMissingKeyMessage =
    form.emailPlatform === "klaviyo" && !form.emailApiKey.trim()
      ? "Klaviyo API key was skipped on the previous screen. Go back and add it to see your live lists."
      : null;

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
      testimonials: form.testimonials.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  function removeTestimonial(index: number) {
    setForm((f) => ({
      ...f,
      testimonials: form.testimonials.filter((_, i) => i !== index),
    }));
  }

  function generateEngagementId() {
    const slug = form.buyerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `eng_${slug}_${Date.now().toString(36)}`;
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    const engagementId = form.engagementId || generateEngagementId();

    const hostingMetaByPlatform: Record<string, Record<string, string>> = {
      webflow: {
        webflow_site_id: form.hostingWebflowSiteId,
        webflow_collection_id: form.hostingWebflowCollectionId,
      },
      wordpress: {
        wordpress_site_url: form.hostingWordpressSiteUrl,
      },
      nextjs_vercel: {
        vercel_project_name: form.hostingVercelProjectName,
        vercel_team_id: form.hostingVercelTeamId,
      },
    };

    const emailPlatformMeta: Record<string, string> = {};

    if (form.emailPlatform === "klaviyo") {
      if (form.emailTargetListId) emailPlatformMeta.target_list_id = form.emailTargetListId;
      if (form.emailRecoveryListId) emailPlatformMeta.recovery_list_id = form.emailRecoveryListId;
    } else if (form.emailPlatform === "activecampaign") {
      if (form.emailActiveCampaignBaseUrl) emailPlatformMeta.base_url = form.emailActiveCampaignBaseUrl;
      if (form.emailTargetListId) emailPlatformMeta.target_list_id = form.emailTargetListId;
      if (form.emailRecoveryListId) emailPlatformMeta.recovery_list_id = form.emailRecoveryListId;
    } else if (form.emailPlatform === "ghl") {
      if (form.emailGhlLocationId) emailPlatformMeta.location_id = form.emailGhlLocationId;
      if (form.emailGhlTargetWorkflowId) emailPlatformMeta.target_workflow_id = form.emailGhlTargetWorkflowId;
      if (form.emailGhlRecoveryWorkflowId) emailPlatformMeta.recovery_workflow_id = form.emailGhlRecoveryWorkflowId;
    } else if (form.emailPlatform === "mailchimp" || form.emailPlatform === "convertkit") {
      if (form.emailTargetListId) emailPlatformMeta.target_list_id = form.emailTargetListId;
      if (form.emailRecoveryListId) emailPlatformMeta.recovery_list_id = form.emailRecoveryListId;
    }

    const testimonials = form.testimonials.filter((t) => t.name && t.role && t.quote);

 const payload = {
      engagementId,
      whopUserId: "from_session",
      buyerName: form.buyerName,
      offerDetails: {
        name: form.offerName,
        price: form.offerPrice,
        icp: form.offerIcp,
        traffic_temperature: form.trafficTemperature,
        hybrid_mode_enabled: form.hybridMode,
        vertical: form.offerVertical || undefined,
      },
      stack: {
        // 1. Core Platform Selection
        booking_platform: form.bookingPlatform,
        booking_platform_credentials_ref: `secrets://${engagementId}/${form.bookingPlatform}_pat`,
        booking_standing_link: form.bookingStandingLink || undefined,
        email_platform: form.emailPlatform,
        email_platform_credentials_ref: `secrets://${engagementId}/${form.emailPlatform}_key`,
        hosting_platform: form.hostingPlatform,
        hosting_platform_credentials_ref: `secrets://${engagementId}/${form.hostingPlatform}_key`,
        publish_domain: form.publishDomain,
        hosting_platform_meta: hostingMetaByPlatform[form.hostingPlatform] ?? undefined,
        brief_landing_destination: form.briefDestination,
        slack_webhook_url: form.slackWebhookUrl,
        person_match_confidence_threshold: 99,
        buyer_domain: form.marketingDomain || undefined,
        existing_confirmation_page_url: form.existingConfirmationPageUrl || undefined,

        // 2. Flat DB Properties (Matches database schema.ts exactly)
        target_list_id: form.emailTargetListId || undefined,
        recovery_list_id: form.emailRecoveryListId || undefined,
        activecampaign_base_url: form.emailActiveCampaignBaseUrl || undefined,
        recovery_workflow_id: form.emailPlatform === "ghl" ? form.emailGhlRecoveryWorkflowId : undefined,
        target_workflow_id: form.emailPlatform === "ghl" ? form.emailGhlTargetWorkflowId : undefined,
        recovery_automation_id: form.emailPlatform === "activecampaign" ? form.recoveryAutomationId || undefined : undefined,
        long_term_nurture_list_id: form.longTermNurtureListId || undefined,

        // 3. Email Platform Nested Metadata Block (Downstream Backward Compatibility)
        email_platform_meta: {
          target_list_id: form.emailTargetListId || undefined,
          recovery_list_id: form.emailRecoveryListId || undefined,
          base_url: form.emailActiveCampaignBaseUrl || undefined,
          location_id: form.emailGhlLocationId || undefined,
          target_workflow_id: form.emailGhlTargetWorkflowId || undefined,
          recovery_workflow_id: form.emailGhlRecoveryWorkflowId || undefined,
          recovery_automation_id: form.recoveryAutomationId || undefined,
          long_term_nurture_list_id: form.longTermNurtureListId || undefined,
        },

        // 4. Booking Platform Meta (Fixes Calendly Booking + GHL Email location_id bug)
       // ✅ Safe, non-destructive assignment matrix
booking_platform_meta: {
  location_id: form.bookingPlatform === "ghl_calendar"
    ? (form.bookingLocationId || undefined)
    : (form.emailPlatform === "ghl" ? form.emailGhlLocationId || undefined : undefined),
},

        // 5. Unlisted platform auto-docs discovery triggers
        ...((form.bookingPlatform === "discover_from_docs" || form.hostingPlatform === "discover_from_docs") && {
          discovered_platform_name: form.discoveredPlatformName || undefined,
          discovered_platform_website: form.discoveredPlatformWebsite || undefined,
        }),

        // 6. Pile-On SMS Sequence Metadata
        sms_platform: form.smsPlatform,
        sms_platform_credentials_ref: form.smsPlatform !== "none" ? `secrets://${engagementId}/${form.smsPlatform}_key` : undefined,
        sms_platform_meta:
          form.smsPlatform === "twilio"
            ? {
                twilio_account_sid: form.smsTwilioAccountSid || undefined,
                twilio_messaging_service_sid: form.smsTwilioMessagingServiceSid || undefined,
                twilio_from_number: form.smsTwilioFromNumber || undefined,
              }
            : form.smsPlatform === "ghl_sms"
              ? { ghl_location_id: form.bookingLocationId || form.emailGhlLocationId || undefined }
              : undefined,
        sms_a2p_10dlc_status: form.smsPlatform === "twilio" ? form.smsA2p10dlcStatus : undefined,
        sms_compliance_footer_variant: form.smsComplianceFooterVariant,
        sms_compliance_footer_custom: form.smsComplianceFooterVariant === "custom" ? form.smsComplianceFooterCustom || undefined : undefined,

        // 7. Cohort Attribution Syncer
        ad_data_platform: form.adDataPlatform,
        ad_data_platform_credentials_ref:
          form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" ? `secrets://${engagementId}/${form.adDataPlatform}_key` : undefined,
        ad_data_cohort_id: form.adDataCohortId || undefined,
        ad_data_platform_meta:
          form.adDataPlatform === "hyros"
            ? { hyros_account_id: form.adDataHyrosAccountId || undefined }
            : form.adDataPlatform === "google_sheets"
              ? {
                  google_sheets_spreadsheet_id: form.adDataGoogleSheetsSpreadsheetId || undefined,
                  google_sheets_cohort_sheet_name: form.adDataGoogleSheetsSheetName || undefined,
                }
              : undefined,

        // 8. Legacy auditing flags & triggers
        existing_pile_on_sequence_flagged: form.existingPileOnSequenceFlagged || undefined,
        brief_trigger_type: form.briefTriggerType,
        brief_lead_time_hours: 12,

        // 9. Video Dropoff Analytics
        video_engagement_platform: form.videoEngagementPlatform,
        video_engagement_credentials_ref:
          form.videoEngagementPlatform !== "none" ? `secrets://${engagementId}/${form.videoEngagementPlatform}_key` : undefined,
        hero_video_id: form.heroVideoId || undefined,
        video_engagement_meta:
          form.videoEngagementPlatform !== "none"
            ? {
                wistia_video_id: form.videoEngagementWistiaVideoId || undefined,
                youtube_channel_id: form.videoEngagementYoutubeChannelId || undefined,
              }
            : undefined,

        // 10. Third-Party Data Integrations (BYOK)
        prospect_research_sources_used: form.prospectResearchSourcesUsed.length > 0 ? form.prospectResearchSourcesUsed : undefined,
        apollo_credentials_ref: form.prospectResearchSourcesUsed.includes("apollo") ? `secrets://${engagementId}/apollo_key` : undefined,
        pdl_credentials_ref: form.prospectResearchSourcesUsed.includes("pdl") ? `secrets://${engagementId}/pdl_key` : undefined,

        // 11. Win-Back Workflow Settings
        reschedule_mode: form.rescheduleMode,
        recovered_from_no_show_tagging_enabled: form.recoveredFromNoShowTaggingEnabled,
        inbound_reply_mode: form.inboundReplyMode,
        hubspot_portal_id: form.inboundReplyMode === "native" && form.emailPlatform === "hubspot" ? form.hubspotPortalId || undefined : undefined,
        // ── Leak Map recovery gap 1 — buyer-configurable, timezone-aware cadence
        weekly_summary_schedule: { dayOfWeek: form.weeklyScheduleDayOfWeek, hourLocal: form.weeklyScheduleHour, timezone: form.leakMapTimezone },
        monthly_deep_dive_schedule: { dayOfMonth: form.monthlyScheduleDayOfMonth, hourLocal: form.weeklyScheduleHour, timezone: form.leakMapTimezone },
        // ── Leak Map recovery gap 2 — report delivery format ────────────────
        audit_output_format: form.auditOutputFormat,
        leak_map_report_email: form.auditOutputFormat === "email" ? form.leakMapReportEmail || undefined : undefined,
        // ── Leak Map recovery gap 4 — existing-audit audit ──────────────────
        existing_audit_flagged: form.existingAuditFlagged || undefined,
        existing_audit_description: form.existingAuditFlagged ? form.existingAuditDescription || undefined : undefined,
        // ── Leak Map recovery gap 3 — notification pack ─────────────────────
        notification_pack_selections: form.notificationPackSelections.length > 0 ? form.notificationPackSelections : undefined,
      },
      topCallQuestions: form.topCallQuestions.split("\n").map((q) => q.trim()).filter(Boolean),
      topObjections: form.topObjections.split("\n").map((o) => o.trim()).filter(Boolean),
      prospectMeets: form.prospectMeets,
      rawVoiceCorpus: form.rawVoiceCorpus,
      existingProof: testimonials.length ? { testimonials } : undefined,
      credentials: {
        booking: form.bookingApiKey,
        email: form.emailApiKey,
        hosting: form.hostingApiKey || undefined,
        sms: form.smsPlatform !== "none" ? form.smsApiKey || undefined : undefined,
        adData: form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" ? form.adDataApiKey || undefined : undefined,
        videoEngagement: form.videoEngagementPlatform !== "none" ? form.videoEngagementApiKey || undefined : undefined,
        apollo: form.prospectResearchSourcesUsed.includes("apollo") ? form.apolloApiKey || undefined : undefined,
        pdl: form.prospectResearchSourcesUsed.includes("pdl") ? form.pdlApiKey || undefined : undefined,
        slack_webhook_url: form.slackWebhookUrl,
      },
    };

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
        {/* Step: Your Offer */}
        {step === "offer" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div className="md:col-span-2 rounded-lg p-3 space-y-2 shadow-xs" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                Smart pre-fill (optional)
              </label>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Have the clients domain? We will crawl it and suggest values below — review and edit anything before submitting.
              </p>
              <div className="flex gap-2">
                <input
                  value={prefillDomain}
                  onChange={(e) => setPrefillDomain(e.target.value)}
                  placeholder="clientsite.com"
                  className="flex-1 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
            <button
  type="button"
  onClick={runSmartPrefill}
  disabled={prefillLoading || !prefillDomain.trim()}
  className="px-3.5 py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
>
  {prefillLoading ? "Crawling…" : "Pre-fill"}
</button>
              </div>
              {prefillError && (
                <p className="text-[11px] font-mono" style={{ color: "var(--error)" }}>{prefillError}</p>
              )}
              {prefillNotes.length > 0 && (
                <ul className="text-[11px] list-disc list-inside space-y-0.5" style={{ color: "var(--text-muted)" }}>
                  {prefillNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>
            <InputField
              label="Client / Company Name"
              value={form.buyerName}
              onChange={(v) => set("buyerName", v)}
              placeholder="e.g. Acme Corporation"
              required
            />
            <InputField
              label="What are you selling?"
              value={form.offerName}
              onChange={(v) => set("offerName", v)}
              placeholder="e.g. Enterprise Consulting Program"
              required
            />
            <InputField
              label="Price"
              value={form.offerPrice}
              onChange={(v) => set("offerPrice", v)}
              placeholder="e.g. $10,000"
            />
            <InputField
              label="Industry / vertical"
              value={form.offerVertical}
              onChange={(v) => set("offerVertical", v)}
              placeholder="e.g. coaching, agency, SaaS, consulting"
              helpText="Powers Leak Map's cross-client benchmarks — how this offer's metrics compare to similar offers, once enough engagements report the same bucket."
            />
            <SelectField
              label="Where are leads coming from?"
              value={form.trafficTemperature}
              onChange={(v) => set("trafficTemperature", v)}
              options={[
                { value: "cold", label: "Cold — outbound outreach or paid ads" },
                { value: "warm", label: "Warm — inbound content or referrals" },
                { value: "hot", label: "Hot — people who already know you" },
              ]}
            />
            <div className="md:col-span-2">
              <InputField
                label="Who's the ideal customer?"
                value={form.offerIcp}
                onChange={(v) => set("offerIcp", v)}
                placeholder="e.g. B2B founders doing $1M-$10M in revenue"
                helpText="A short description of who this offer is built for. Used to personalize follow-ups and briefs."
              />
            </div>
            <InputField
              label="Who runs the calls?"
              value={form.prospectMeets}
              onChange={(v) => set("prospectMeets", v)}
              placeholder="e.g. Lead Strategist"
              helpText="The role or title of whoever takes these calls (e.g. closer, founder, account lead)."
            />

            <div className="flex items-start space-x-3 pt-4 select-none md:col-span-1">
              <input
                type="checkbox"
                id="hybrid"
                checked={form.hybridMode}
                onChange={(e) => set("hybridMode", e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer mt-0.5 border border-zinc-300 dark:border-zinc-800"
                style={{ accentColor: "var(--accent)" }}
              />
              <label htmlFor="hybrid" className="text-xs cursor-pointer leading-normal" style={{ color: "var(--text-secondary)" }}>
                Personalize each booking confirmation using AI, based on who booked the call.
              </label>
            </div>
          </div>
        )}

        {/* Step: Account Keys */}
        {step === "credentials" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div className="md:col-span-2 text-xs font-mono">
              <p className="font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>How we keep this secure</p>
              <p className="font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>
                Your keys are encrypted before they&apos;re stored, and aren&apos;t shown again once saved.
              </p>
            </div>
            <InputField
              label={`${BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform} API Key`}
              value={form.bookingApiKey}
              onChange={(v) => set("bookingApiKey", v)}
              type="password"
              placeholder="Paste your API key here..."
              helpText={form.bookingPlatform === "calendly" ? "From Calendly → Integrations & Apps → API & Webhooks → Personal Access Tokens." : undefined}
              required
            />
            {form.emailPlatform === "smtp" ? (
              <>
                <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                  Custom SMTP has no single API key — enter your mail server's connection details below. This only runs the Win-Back recovery cadence; Pile-On needs an ESP.
                </div>
                <InputField
                  label="SMTP Host"
                  value={form.smtpHost}
                  onChange={(v) => set("smtpHost", v)}
                  placeholder="smtp.yourprovider.com"
                  required
                />
                <InputField
                  label="SMTP Port"
                  value={form.smtpPort}
                  onChange={(v) => set("smtpPort", v)}
                  placeholder="587"
                  required
                />
                <InputField
                  label="SMTP Username"
                  value={form.smtpUsername}
                  onChange={(v) => set("smtpUsername", v)}
                  placeholder="mailer@yourdomain.com"
                  required
                />
                <InputField
                  label="SMTP Password"
                  value={form.smtpPassword}
                  onChange={(v) => set("smtpPassword", v)}
                  type="password"
                  placeholder="••••••••"
                  required
                />
                <InputField
                  label="From address"
                  value={form.smtpFromAddress}
                  onChange={(v) => set("smtpFromAddress", v)}
                  placeholder="hello@yourdomain.com"
                  required
                />
                <InputField
                  label="From name (optional)"
                  value={form.smtpFromName}
                  onChange={(v) => set("smtpFromName", v)}
                  placeholder="Your Company"
                />
                <div className="flex items-start space-x-3 md:col-span-2 select-none">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={form.smtpSecure}
                    onChange={(e) => set("smtpSecure", e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer mt-0.5 border border-zinc-300 dark:border-zinc-800"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <label htmlFor="smtpSecure" className="text-xs cursor-pointer leading-normal" style={{ color: "var(--text-secondary)" }}>
                    Use implicit TLS (typically port 465). Leave unchecked for STARTTLS on 587.
                  </label>
                </div>
              </>
            ) : (
              <InputField
                label={`${EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform} API Key`}
                value={form.emailApiKey}
                onChange={(v) => set("emailApiKey", v)}
                type="password"
                placeholder="Paste your API key here..."
                required
              />
            )}
            {form.hostingPlatform !== "ghl" && form.hostingPlatform !== "plain_html" && (
              <InputField
                label={`${HOSTING_PLATFORM_LABELS[form.hostingPlatform] ?? form.hostingPlatform} ${form.hostingPlatform === "wordpress" ? "Application Password (user:password)" : "API Token"}`}
                value={form.hostingApiKey}
                onChange={(v) => set("hostingApiKey", v)}
                type="password"
                placeholder="Paste your API key or token here..."
                helpText={form.hostingPlatform === "wordpress" ? "WordPress → Users → Profile → Application Passwords. Format: username:password." : "If this isn't available yet, we'll generate the page as ready-to-paste HTML."}
              />
            )}
          </div>
        )}

        {/* Step: Connect Your Tools */}
        {step === "stack" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <SelectField
              label="Booking Calendar"
              value={form.bookingPlatform}
              onChange={(v) => set("bookingPlatform", v)}
              options={Object.entries(BOOKING_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
              helpText="The tool your client uses to schedule calls."
            />

            {form.bookingPlatform === "calendly" && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                <strong>Zero-Config Mode Active:</strong> You don&apos;t need to look up or paste any organization links or event IDs. We automatically detect your workspace parameters.
              </div>
            )}

            {form.bookingPlatform === "cal_com" && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                ✨ <strong>Zero-Config Mode Active:</strong> We will automatically parse your account username and event context from the standing link behind the scenes.
              </div>
            )}

            {form.bookingPlatform === "ghl_calendar" && (
              <InputField
                label="GoHighLevel Location ID"
                value={form.bookingLocationId}
                onChange={(v) => set("bookingLocationId", v)}
                placeholder="e.g. loc_abc123"
                helpText="Found in GoHighLevel under your sub-account settings."
              />
            )}

            {form.bookingPlatform === "discover_from_docs" && (
              <>
                <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                  We'll research this platform's public developer docs and draft an integration proposal for review — it won't touch your client's account until an admin approves it. Bookings on this platform won't auto-enroll until then.
                </div>
                <InputField
                  label="Platform name"
                  value={form.discoveredPlatformName}
                  onChange={(v) => set("discoveredPlatformName", v)}
                  placeholder="e.g. Acuity Scheduling"
                  helpText="Whatever your client actually uses."
                />
                <InputField
                  label="Platform website"
                  value={form.discoveredPlatformWebsite}
                  onChange={(v) => set("discoveredPlatformWebsite", v)}
                  placeholder="https://theirplatform.com"
                />
              </>
            )}

            <InputField
              label="Standing booking page link"
              value={form.bookingStandingLink}
              onChange={(v) => set("bookingStandingLink", v)}
              placeholder="https://calendly.com/client/discovery-call"
              helpText="The client's always-open booking page. We'll automatically find the matching event parameters from this link."
            />

            <SelectField
              label="Email Platform"
              value={form.emailPlatform}
              onChange={(v) => set("emailPlatform", v)}
              options={Object.entries(EMAIL_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
              helpText="Where follow-up and win-back emails get sent from."
            />

            {form.emailPlatform === "klaviyo" && (
              <>
                {fetchingLists && (
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                    ⚡ Contacting Klaviyo... Synchronizing list profile parameters...
                  </div>
                )}
                {(klaviyoMissingKeyMessage ?? listsFetchError) && (
                  <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                    ⚠ Warning: {klaviyoMissingKeyMessage ?? listsFetchError}
                  </div>
                )}

                <SelectField
                  label="Klaviyo Target List (Pile-On)"
                  value={form.emailTargetListId}
                  onChange={(v) => set("emailTargetListId", v)}
                  required
                  options={[
                    { value: "", label: "-- Choose an Active Klaviyo Audience --" },
                    ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                  ]}
                  helpText="Select the target list that houses your main pre-call nurture follow-up flow configuration."
                />
                <SelectField
                  label="Klaviyo Recovery List (Win-Back)"
                  value={form.emailRecoveryListId}
                  onChange={(v) => set("emailRecoveryListId", v)}
                  required
                  options={[
                    { value: "", label: "-- Choose an Active Klaviyo Audience --" },
                    ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                  ]}
                  helpText="Select the audience list configured to lock in canceled no-show recoveries."
                />
                <SelectField
      label="Klaviyo Long-Term Nurture List"
      value={form.longTermNurtureListId}
      onChange={(v) => set("longTermNurtureListId", v)}
      options={[
        { value: "", label: "-- Choose a Long-Term Nurture List (Optional) --" },
        ...klaviyoLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
      ]}
      helpText="Select the list where prospects should be auto-enrolled when their 30-day win-back window expires."
    />
              </>
            )}

            {form.emailPlatform === "activecampaign" && (
              <>
                <InputField
                  label="ActiveCampaign API Access URL"
                  value={form.emailActiveCampaignBaseUrl}
                  onChange={(v) => set("emailActiveCampaignBaseUrl", v)}
                  placeholder="https://account.api-us1.com/api/3"
                  helpText="Your unique tracking endpoint link. Found under Settings → Developer → API Access. Lists will auto-populate below once entered."
                  required
                />
                
                {fetchingAcLists && (
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                    ⚡ Contacting ActiveCampaign... Fetching audience lists...
                  </div>
                )}
                {acListsError && (
                  <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                    ⚠ Warning: {acListsError}
                  </div>
                )}

                <SelectField
                  label="ActiveCampaign Target List"
                  value={form.emailTargetListId}
                  onChange={(v) => set("emailTargetListId", v)}
                  required
                  disabled={!form.emailActiveCampaignBaseUrl.trim() || fetchingAcLists}
                  options={[
                    { value: "", label: form.emailActiveCampaignBaseUrl.trim() ? "-- Choose a List --" : "-- Enter API URL above first --" },
                    ...acLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                  ]}
                  helpText="The audience for your main follow-up sequence."
                />
                <SelectField
                  label="ActiveCampaign Recovery List"
                  value={form.emailRecoveryListId}
                  onChange={(v) => set("emailRecoveryListId", v)}
                  required
                  disabled={!form.emailActiveCampaignBaseUrl.trim() || fetchingAcLists}
                  options={[
                    { value: "", label: form.emailActiveCampaignBaseUrl.trim() ? "-- Choose a List --" : "-- Enter API URL above first --" },
                    ...acLists.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }))
                  ]}
                  helpText="The audience for your win-back recovery sequence."
                />
                <InputField
      label="ActiveCampaign Recovery Automation ID"
      value={form.recoveryAutomationId}
      onChange={(v) => set("recoveryAutomationId", v)}
      placeholder="e.g. 12"
      helpText="The numeric ID of your win-back automation flow inside ActiveCampaign, used for direct API exits."
    />
              </>
            )}

            {form.emailPlatform === "mailchimp" && (
              <>
                <InputField
                  label="Mailchimp Target Audience ID (Pile-On)"
                  value={form.emailTargetListId}
                  onChange={(v) => set("emailTargetListId", v)}
                  placeholder="e.g. a1b2c3d4e5"
                  helpText="Audience ID housing your pre-call nurture flow. Found under Audience → Settings → Audience name and defaults."
                  required
                />
                <InputField
                  label="Mailchimp Recovery Audience ID (Win-Back)"
                  value={form.emailRecoveryListId}
                  onChange={(v) => set("emailRecoveryListId", v)}
                  placeholder="e.g. f6g7h8i9j0"
                  helpText="Audience configured to run your no-show recovery journey."
                  required
                />
              </>
            )}

            {form.emailPlatform === "convertkit" && (
              <>
                <InputField
                  label="ConvertKit Target Form ID (Pile-On)"
                  value={form.emailTargetListId}
                  onChange={(v) => set("emailTargetListId", v)}
                  placeholder="e.g. 1234567"
                  helpText="The form that triggers your pre-call nurture sequence. Found under Grow → Landing Pages & Forms."
                  required
                />
                <InputField
                  label="ConvertKit Recovery Tag ID (Win-Back)"
                  value={form.emailRecoveryListId}
                  onChange={(v) => set("emailRecoveryListId", v)}
                  placeholder="e.g. 7654321"
                  helpText="The tag that triggers your win-back recovery automation. Found under Subscribers → Tags."
                  required
                />
              </>
            )}

            {form.emailPlatform === "smtp" && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                Custom SMTP doesn't need list/workflow IDs — it's a direct-send channel, this app owns the schedule. Enter your mail server details on the Account Keys step.
              </div>
            )}

            {form.emailPlatform === "ghl" && (
              <>
                {fetchingGhlLocations && (
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                    ⚡ Contacting GoHighLevel... Fetching locations...
                  </div>
                )}
                {ghlLocationsError && (
                  <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                    ⚠ Warning: {ghlLocationsError}
                  </div>
                )}

                <SelectField
                  label="GoHighLevel Location"
                  value={form.emailGhlLocationId}
                  onChange={(v) => {
                    set("emailGhlLocationId", v);
                    set("emailGhlTargetWorkflowId", "");
                    set("emailGhlRecoveryWorkflowId", "");
                  }}
                  required
                  options={[
                    { value: "", label: "-- Choose a Location --" },
                    ...ghlLocations.map((l) => ({ value: l.id, label: l.name }))
                  ]}
                  helpText="Your GoHighLevel sub-account. Workflows will load after selection."
                />

                {form.emailGhlLocationId && (
                  <>
                    {fetchingGhlWorkflows && (
                      <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 dark:text-zinc-400 animate-pulse">
                        ⚡ Loading workflows for selected location...
                      </div>
                    )}
                    {ghlWorkflowsError && (
                      <div className="md:col-span-2 rounded p-3 text-xs font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in-40">
                        ⚠ Warning: {ghlWorkflowsError}
                      </div>
                    )}

                    <SelectField
                      label="GHL Target Workflow"
                      value={form.emailGhlTargetWorkflowId}
                      onChange={(v) => set("emailGhlTargetWorkflowId", v)}
                      required
                      disabled={fetchingGhlWorkflows}
                      options={[
                        { value: "", label: fetchingGhlWorkflows ? "-- Loading..." : "-- Choose a Workflow --" },
                        ...ghlWorkflows.map((w) => ({ value: w.id, label: w.name }))
                      ]}
                      helpText="The workflow for your pre-call automation."
                    />
                    <SelectField
                      label="GHL Recovery Workflow"
                      value={form.emailGhlRecoveryWorkflowId}
                      onChange={(v) => set("emailGhlRecoveryWorkflowId", v)}
                      required
                      disabled={fetchingGhlWorkflows}
                      options={[
                        { value: "", label: fetchingGhlWorkflows ? "-- Loading..." : "-- Choose a Workflow --" },
                        ...ghlWorkflows.map((w) => ({ value: w.id, label: w.name }))
                      ]}
                      helpText="The workflow for your win-back cancellation sequence."
                    />
                  </>
                )}
              </>
            )}

            <SelectField
              label="Where should call briefs go?"
              value={form.briefDestination}
              onChange={(v) => set("briefDestination", v)}
              options={[
                { value: "slack", label: "Slack message" },
                { value: "crm_note", label: "Note in your CRM" },
              ]}
              helpText="Where the AI-written brief lands before each call."
            />

            {form.briefDestination === "slack" && (
              <InputField
                label="Slack Webhook URL"
                value={form.slackWebhookUrl}
                onChange={(v) => set("slackWebhookUrl", v)}
                placeholder="https://hooks.slack.com/services/..."
                helpText="From Slack → your workspace → Incoming Webhooks."
              />
            )}

            <SelectField
  label="Pre-Call Brief Schedule"
  value={form.briefTriggerType}
  onChange={(v) => set("briefTriggerType", v as any)}
  options={[
    { 
      value: "nightly", 
      label: "Nightly Batch — Group and brief tomorrow's roster at 20:00 UTC" 
    },
    { 
      value: "dynamic_webhook", 
      label: "Dynamic Poll — Brief individually within 15 minutes of entering the lead window" 
    },
  ]}
  helpText="Choose 'Dynamic' if your sales reps require briefs to be generated on-demand as soon as an upcoming call crosses into its imminent lead-time window."
/>

            <SelectField
              label="Where is the confirmation page hosted?"
              value={form.hostingPlatform}
              onChange={(v) => set("hostingPlatform", v)}
              options={Object.entries(HOSTING_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
              helpText="The confirmation page publishes directly onto the client's own site — it never lives on our domain."
            />

            <InputField
              label="Website Domain"
              value={form.publishDomain}
              onChange={(v) => set("publishDomain", v)}
              placeholder="yoursite.com"
              helpText="Used to build the confirmation link people land on after booking."
            />

            {form.hostingPlatform === "webflow" && (
              <>
                <InputField
                  label="Webflow Site ID"
                  value={form.hostingWebflowSiteId}
                  onChange={(v) => set("hostingWebflowSiteId", v)}
                  placeholder="e.g. 5f1a2b3c..."
                  helpText="Webflow → Site Settings → General → Site ID."
                />
                <InputField
                  label="Webflow Collection ID"
                  value={form.hostingWebflowCollectionId}
                  onChange={(v) => set("hostingWebflowCollectionId", v)}
                  placeholder="e.g. 6a2b3c4d..."
                  helpText="The CMS collection the confirmation page item gets created in."
                />
              </>
            )}

            {form.hostingPlatform === "wordpress" && (
              <div className="md:col-span-2">
                <InputField
                  label="WordPress Site URL"
                  value={form.hostingWordpressSiteUrl}
                  onChange={(v) => set("hostingWordpressSiteUrl", v)}
                  placeholder="https://client-site.com"
                  helpText="The client's WordPress base URL."
                />
              </div>
            )}

            {form.hostingPlatform === "nextjs_vercel" && (
              <>
                <InputField
                  label="Vercel Project Name"
                  value={form.hostingVercelProjectName}
                  onChange={(v) => set("hostingVercelProjectName", v)}
                  placeholder="e.g. client-confirmation-page"
                  helpText="Deployed under the client's own Vercel account/team, not ours."
                />
                <InputField
                  label="Vercel Team ID (optional)"
                  value={form.hostingVercelTeamId}
                  onChange={(v) => set("hostingVercelTeamId", v)}
                  placeholder="e.g. team_abc123"
                  helpText="Only needed if the client's Vercel account belongs to a team."
                />
              </>
            )}

            {(form.hostingPlatform === "ghl" || form.hostingPlatform === "plain_html") && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                {form.hostingPlatform === "ghl"
                  ? "GoHighLevel's funnel builder doesn't support automatic publishing yet. We'll generate the page as ready-to-paste HTML with step-by-step instructions instead."
                  : "Plain HTML sites are published manually. We'll generate a self-contained HTML file the client uploads to their own host."}
              </div>
            )}

            {form.hostingPlatform === "discover_from_docs" && (
              <>
                <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                  We'll research this platform's publishing API and draft an integration proposal for review. Until it's approved, the confirmation page ships as ready-to-paste HTML — nothing is blocked in the meantime.
                </div>
                <InputField
                  label="Platform name"
                  value={form.discoveredPlatformName}
                  onChange={(v) => set("discoveredPlatformName", v)}
                  placeholder="e.g. Squarespace"
                  helpText="Whatever your client actually uses."
                />
                <InputField
                  label="Platform website"
                  value={form.discoveredPlatformWebsite}
                  onChange={(v) => set("discoveredPlatformWebsite", v)}
                  placeholder="https://theirplatform.com"
                />
              </>
            )}

            {/* Pile-On recovery gap 1 — SMS */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                SMS Sequence (optional)
              </label>
            </div>
            <SelectField
              label="SMS Platform"
              value={form.smsPlatform}
              onChange={(v) => set("smsPlatform", v)}
              options={[
                { value: "none", label: "No SMS sequence" },
                { value: "twilio", label: "Twilio" },
                { value: "ghl_sms", label: "GoHighLevel SMS" },
                { value: "hubspot_sms", label: "HubSpot SMS" },
              ]}
            />
            {form.smsPlatform !== "none" && (
              <InputField
                label={form.smsPlatform === "twilio" ? "Twilio Auth Token" : form.smsPlatform === "ghl_sms" ? "GoHighLevel API Key" : "HubSpot API Key"}
                value={form.smsApiKey}
                onChange={(v) => set("smsApiKey", v)}
                type="password"
              />
            )}
            {form.smsPlatform === "twilio" && (
              <>
                <InputField
                  label="Twilio Account SID"
                  value={form.smsTwilioAccountSid}
                  onChange={(v) => set("smsTwilioAccountSid", v)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <InputField
                  label="Twilio Messaging Service SID"
                  value={form.smsTwilioMessagingServiceSid}
                  onChange={(v) => set("smsTwilioMessagingServiceSid", v)}
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  helpText="Preferred over a single From number — Twilio handles number pooling/failover."
                />
                <InputField
                  label="Twilio From Number (if no Messaging Service)"
                  value={form.smsTwilioFromNumber}
                  onChange={(v) => set("smsTwilioFromNumber", v)}
                  placeholder="+15551234567"
                />
                <SelectField
                  label="A2P 10DLC Status"
                  value={form.smsA2p10dlcStatus}
                  onChange={(v) => set("smsA2p10dlcStatus", v)}
                  options={[
                    { value: "not_started", label: "Not started" },
                    { value: "brand_registered", label: "Brand registered" },
                    { value: "campaign_approved", label: "Campaign approved" },
                  ]}
                  helpText="Must be 'Campaign approved' or we'll refuse to send — unregistered marketing SMS gets carrier-filtered."
                />
              </>
            )}
            {form.smsPlatform !== "none" && (
              <SelectField
                label="Compliance footer"
                value={form.smsComplianceFooterVariant}
                onChange={(v) => set("smsComplianceFooterVariant", v as "standard" | "custom")}
                options={[
                  { value: "standard", label: "Standard (Reply STOP to unsubscribe, HELP for help)" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            )}
            {form.smsPlatform !== "none" && form.smsComplianceFooterVariant === "custom" && (
              <InputField
                label="Custom compliance footer"
                value={form.smsComplianceFooterCustom}
                onChange={(v) => set("smsComplianceFooterCustom", v)}
                placeholder="Text STOP to opt out."
              />
            )}

            {/* Pile-On recovery gap 2 — ad-data cohort sync */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                Ad-Data Cohort Sync (optional)
              </label>
            </div>
            <SelectField
              label="Ad-Data Platform"
              value={form.adDataPlatform}
              onChange={(v) => set("adDataPlatform", v)}
              options={[
                { value: "none", label: "No ad-data sync" },
                { value: "hyros", label: "Hyros" },
                { value: "google_sheets", label: "Google Sheets" },
                { value: "native_crm", label: `Tag on ${form.emailPlatform || "email/CRM platform"} (no separate credential)` },
              ]}
            />
            {form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" && (
              <InputField
                label={form.adDataPlatform === "hyros" ? "Hyros API Key" : "Google Sheets Access Token"}
                value={form.adDataApiKey}
                onChange={(v) => set("adDataApiKey", v)}
                type="password"
              />
            )}
            {form.adDataPlatform === "hyros" && (
              <InputField
                label="Hyros Account ID (optional)"
                value={form.adDataHyrosAccountId}
                onChange={(v) => set("adDataHyrosAccountId", v)}
              />
            )}
            {form.adDataPlatform === "google_sheets" && (
              <>
                <InputField
                  label="Spreadsheet ID"
                  value={form.adDataGoogleSheetsSpreadsheetId}
                  onChange={(v) => set("adDataGoogleSheetsSpreadsheetId", v)}
                  helpText="The long ID in the sheet's URL between /d/ and /edit."
                />
                <InputField
                  label="Sheet/tab name"
                  value={form.adDataGoogleSheetsSheetName}
                  onChange={(v) => set("adDataGoogleSheetsSheetName", v)}
                  placeholder="Cohort"
                />
              </>
            )}
            {form.adDataPlatform !== "none" && (
              <InputField
                label="Cohort name/tag (optional)"
                value={form.adDataCohortId}
                onChange={(v) => set("adDataCohortId", v)}
                placeholder="showtime_pile_on_cohort"
                helpText="Defaults to showtime_pile_on_cohort if left blank."
              />
            )}

            {/* Pile-On recovery gap 4 — existing-sequence audit */}
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.existingPileOnSequenceFlagged}
                  onChange={(e) => set("existingPileOnSequenceFlagged", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  This client already has a pre-call email sequence running on {form.emailPlatform || "their ESP"}.
                  {" "}We'll audit it (Klaviyo/HubSpot only) and show you a keep/replace/merge/drop recommendation per email before anything new goes live.
                </span>
              </label>
            </div>

            {/* Pre-Call Read recovery gap 3 — video engagement */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                Video Engagement (optional)
              </label>
            </div>
            <SelectField
              label="Confirmation-page video platform"
              value={form.videoEngagementPlatform}
              onChange={(v) => set("videoEngagementPlatform", v)}
              options={[
                { value: "none", label: "No video engagement tracking" },
                { value: "vidalytics", label: "Vidalytics" },
                { value: "wistia", label: "Wistia" },
                { value: "youtube_analytics", label: "YouTube (aggregate stats only)" },
                { value: "loom", label: "Loom (no analytics API available)" },
              ]}
              helpText="Vidalytics/Wistia give per-prospect watch data if your video embed passes their email. YouTube can only report aggregate stats, and Loom has no analytics API at all — both are still trackable here for completeness, just with that caveat."
            />
            {(form.videoEngagementPlatform === "vidalytics" || form.videoEngagementPlatform === "wistia" || form.videoEngagementPlatform === "youtube_analytics") && (
              <InputField
                label={`${form.videoEngagementPlatform === "youtube_analytics" ? "Google" : form.videoEngagementPlatform === "vidalytics" ? "Vidalytics" : "Wistia"} API Key`}
                value={form.videoEngagementApiKey}
                onChange={(v) => set("videoEngagementApiKey", v)}
                type="password"
              />
            )}
            {form.videoEngagementPlatform === "vidalytics" && (
              <InputField
                label="Confirmation-page video ID"
                value={form.heroVideoId}
                onChange={(v) => set("heroVideoId", v)}
              />
            )}
            {form.videoEngagementPlatform === "wistia" && (
              <InputField
                label="Wistia video ID"
                value={form.videoEngagementWistiaVideoId}
                onChange={(v) => set("videoEngagementWistiaVideoId", v)}
              />
            )}
            {form.videoEngagementPlatform === "youtube_analytics" && (
              <>
                <InputField
                  label="YouTube channel ID"
                  value={form.videoEngagementYoutubeChannelId}
                  onChange={(v) => set("videoEngagementYoutubeChannelId", v)}
                />
                <InputField
                  label="Confirmation-page video ID"
                  value={form.heroVideoId}
                  onChange={(v) => set("heroVideoId", v)}
                />
              </>
            )}

            {/* Pre-Call Read recovery gap 5 — Apollo/PDL BYOK */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                Prospect Research BYOK (optional)
              </label>
              <p className="text-[11px] font-mono mb-3" style={{ color: "var(--text-muted)" }}>
                If your client already has their own Apollo or PDL subscription, we'll layer it on top of standard web research — never a required cost.
              </p>
            </div>
            <div className="md:col-span-2 flex gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.prospectResearchSourcesUsed.includes("apollo")}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      prospectResearchSourcesUsed: e.target.checked
                        ? [...f.prospectResearchSourcesUsed, "apollo"]
                        : f.prospectResearchSourcesUsed.filter((s) => s !== "apollo"),
                    }))
                  }
                />
                Apollo
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.prospectResearchSourcesUsed.includes("pdl")}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      prospectResearchSourcesUsed: e.target.checked
                        ? [...f.prospectResearchSourcesUsed, "pdl"]
                        : f.prospectResearchSourcesUsed.filter((s) => s !== "pdl"),
                    }))
                  }
                />
                People Data Labs
              </label>
            </div>
            {form.prospectResearchSourcesUsed.includes("apollo") && (
              <InputField label="Apollo API Key" value={form.apolloApiKey} onChange={(v) => set("apolloApiKey", v)} type="password" />
            )}
            {form.prospectResearchSourcesUsed.includes("pdl") && (
              <InputField label="PDL API Key" value={form.pdlApiKey} onChange={(v) => set("pdlApiKey", v)} type="password" />
            )}

            {/* Win-Back recovery gaps 3, 4, 6 */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                Win-Back Recovery (optional)
              </label>
            </div>
            <SelectField
              label="Reschedule link mode"
              value={form.rescheduleMode}
              onChange={(v) => set("rescheduleMode", v as "fresh_link" | "time_slots")}
              options={[
                { value: "time_slots", label: "Live available slots (default)" },
                { value: "fresh_link", label: "Per-prospect single-use link (Calendly/Cal.com only)" },
              ]}
              helpText="fresh_link uses the platform's own per-booking reschedule link when available (Calendly, Cal.com), falling back to live slots per prospect when it isn't (GHL, OnceHub)."
            />
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.recoveredFromNoShowTaggingEnabled}
                  onChange={(e) => set("recoveredFromNoShowTaggingEnabled", e.target.checked)}
                  className="mt-0.5"
                />
                <span>Tag prospects as "recovered from no-show" on {form.emailPlatform || "the ESP"} when they rebook during an active recovery window.</span>
              </label>
            </div>
            <SelectField
              label="Reply detection (exits the recovery cadence)"
              value={form.inboundReplyMode}
              onChange={(v) => set("inboundReplyMode", v as "native" | "forwarding" | "none")}
              options={[
                { value: "none", label: "Off — cadence only stops on rebook or window elapse" },
                { value: "forwarding", label: "Forwarding — client forwards replies through an inbound-parse bridge" },
                { value: "native", label: "Native — HubSpot Conversations only" },
              ]}
              helpText={
                form.inboundReplyMode === "native" && form.emailPlatform !== "hubspot"
                  ? "Native mode only works with HubSpot — Klaviyo and ActiveCampaign don't expose a stable reply webhook, use forwarding instead."
                  : "A reply of any kind halts the win-back cadence for that prospect — table stakes for anything calling itself win-back."
              }
            />
            {form.inboundReplyMode === "native" && form.emailPlatform === "hubspot" && (
              <InputField
                label="HubSpot Portal ID"
                value={form.hubspotPortalId}
                onChange={(v) => set("hubspotPortalId", v)}
                helpText="Settings → Account Setup → Account Defaults in your client's HubSpot account."
              />
            )}
            {form.inboundReplyMode === "forwarding" && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                We'll generate a unique catcher URL once Win-Back is set up — point your client's Postmark/SendGrid inbound-parse bridge (or a forwarding rule through one) at it.
              </div>
            )}

            {/* Leak Map recovery gaps 1, 2, 3, 4 */}
            <div className="md:col-span-2 pt-4 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <label className="text-xs font-bold uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                Leak Map Reporting
              </label>
            </div>
            <SelectField
              label="Weekly summary — day"
              value={String(form.weeklyScheduleDayOfWeek)}
              onChange={(v) => set("weeklyScheduleDayOfWeek", Number(v) as any)}
              options={[
                { value: "0", label: "Sunday" }, { value: "1", label: "Monday" }, { value: "2", label: "Tuesday" },
                { value: "3", label: "Wednesday" }, { value: "4", label: "Thursday" }, { value: "5", label: "Friday" }, { value: "6", label: "Saturday" },
              ]}
            />
            <SelectField
              label="Report hour (local)"
              value={String(form.weeklyScheduleHour)}
              onChange={(v) => set("weeklyScheduleHour", Number(v) as any)}
              options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h.toString().padStart(2, "0")}:00` }))}
              helpText="Used for both the weekly summary and monthly deep-dive."
            />
            <SelectField
              label="Monthly deep-dive — day of month"
              value={String(form.monthlyScheduleDayOfMonth)}
              onChange={(v) => set("monthlyScheduleDayOfMonth", Number(v) as any)}
              options={Array.from({ length: 28 }, (_, d) => ({ value: String(d + 1), label: String(d + 1) }))}
              helpText="Capped at 28 so it fires reliably every month, including February."
            />
            <InputField
              label="Timezone"
              value={form.leakMapTimezone}
              onChange={(v) => set("leakMapTimezone", v)}
              placeholder="America/New_York"
              helpText="IANA timezone name. Defaults to UTC."
            />
            <SelectField
              label="Report delivery"
              value={form.auditOutputFormat}
              onChange={(v) => set("auditOutputFormat", v as any)}
              options={[
                { value: "dashboard_only", label: "Dashboard only" },
                { value: "slack", label: "Slack" },
                { value: "email", label: "Email" },
              ]}
            />
            {form.auditOutputFormat === "email" && (
              <InputField
                label="Report recipient email"
                value={form.leakMapReportEmail}
                onChange={(v) => set("leakMapReportEmail", v)}
                placeholder="ops@client.com"
              />
            )}
            {form.auditOutputFormat === "slack" && !form.slackWebhookUrl && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs shadow-xs font-mono font-medium" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                Slack delivery uses the Slack webhook URL from the Pre-Call Read brief settings above — add one there if you haven't yet.
              </div>
            )}

            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={form.existingAuditFlagged}
                  onChange={(e) => set("existingAuditFlagged", e.target.checked)}
                  className="mt-0.5"
                />
                <span>This client already has a dashboard, KPI report, or audit process we should know about.</span>
              </label>
            </div>
            {form.existingAuditFlagged && (
              <div className="md:col-span-2">
                <InputField
                  label="Describe their existing report"
                  value={form.existingAuditDescription}
                  onChange={(v) => set("existingAuditDescription", v)}
                  placeholder="e.g. A weekly Google Sheet tracking show-rate and close-rate, reviewed manually every Monday."
                  helpText="We'll compare it against what Leak Map covers and show you the overlap — never replaces or modifies what's already there."
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--text-primary)" }}>
                Notification pack (optional)
              </label>
              <p className="text-[11px] font-mono mb-2" style={{ color: "var(--text-muted)" }}>
                Curated alerts you can activate now — nothing fires unless checked. Thresholds can be adjusted later.
              </p>
              <div className="space-y-2">
                {[
                  { id: "low_identity_confidence", label: "Identity match confidence dropping below 70" },
                  { id: "show_rate_drop", label: "Booking show-rate falling below 50%" },
                  { id: "email_open_rate_drop", label: "Email open-rate falling below 25%" },
                  { id: "pipeline_win_rate_drop", label: "CRM pipeline win-rate falling below 20%" },
                  { id: "brief_volume_drop", label: "Brief delivery volume dropping 10%+ week over week" },
                ].map((pack) => (
                  <label key={pack.id} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={form.notificationPackSelections.includes(pack.id)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          notificationPackSelections: e.target.checked
                            ? [...f.notificationPackSelections, pack.id]
                            : f.notificationPackSelections.filter((id) => id !== pack.id),
                        }))
                      }
                    />
                    {pack.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Your Brand Voice */}
        {step === "voice" && (
          <div className="space-y-6 w-full">
            <div className="space-y-2">
              <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                How should we learn this client&apos;s voice?
              </label>
            <div className="flex gap-2">
  <button
    type="button"
    onClick={() => set("voiceSource", "scrape")}
    className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
      form.voiceSource === "scrape"
        ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
        : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
    }`}
  >
    <span className="font-bold uppercase tracking-wider font-mono block">
      Scrape their website
    </span>
    <p className={`mt-1 leading-relaxed font-normal ${
      form.voiceSource === "scrape" 
        ? "text-zinc-700 dark:text-zinc-300" 
        : "text-zinc-500 dark:text-zinc-400"
    }`}>
      We crawl their site (and recent broadcast emails, if Klaviyo is connected) automatically. Pasting a sample below too still helps if the crawl comes up short.
    </p>
  </button>

  <button
    type="button"
    onClick={() => set("voiceSource", "manual")}
    className={`flex-1 text-left px-4 py-3 rounded-lg text-xs transition-all cursor-pointer shadow-xs border ${
      form.voiceSource === "manual"
        ? "bg-zinc-100 border-zinc-900 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
        : "bg-white border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
    }`}
  >
    <span className="font-bold uppercase tracking-wider font-mono block">
      Paste a writing sample
    </span>
    <p className={`mt-1 leading-relaxed font-normal ${
      form.voiceSource === "manual" 
        ? "text-zinc-700 dark:text-zinc-300" 
        : "text-zinc-500 dark:text-zinc-400"
    }`}>
      Sales copy, call transcripts, or email examples — ready to use right now.
    </p>
  </button>
</div>
            </div>

            {form.voiceSource === "scrape" && (
              <InputField
                label="Marketing website"
                value={form.marketingDomain}
                onChange={(v) => set("marketingDomain", v)}
                placeholder="yoursite.com"
                helpText="We'll crawl this site (and pricing/sales pages if we find them) during setup to build the voice profile."
              />
            )}

            <InputField
              label="Existing confirmation page (if any)"
              value={form.existingConfirmationPageUrl}
              onChange={(v) => set("existingConfirmationPageUrl", v)}
              placeholder="https://yoursite.com/thank-you"
              helpText="If your client already has a post-booking confirmation page live, paste its URL — we'll audit it against the new one and show you what's worth carrying over."
            />

            <div className="space-y-1.5 w-full">
              <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                Sales copy, scripts, or call transcripts (500 words minimum)
              </label>
              <textarea
                value={form.rawVoiceCorpus}
                onChange={(e) => set("rawVoiceCorpus", e.target.value)}
                placeholder="Paste sales call transcripts, email copy, or scripts here..."
                rows={8}
                className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-medium"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              />
              <p className="text-[11px] font-mono font-bold" style={{ color: "var(--text-muted)" }}>
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words pasted.{" "}
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length < 500
                  ? "Add more — at least 500 words are needed to learn the brand voice accurately."
                  : "✓ That's enough to learn the brand voice."}
              </p>
            </div>

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              <div className="space-y-1.5 w-full">
                <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                  Most common questions on calls (one per line)
                </label>
                <textarea
                  value={form.topCallQuestions}
                  onChange={(e) => set("topCallQuestions", e.target.value)}
                  placeholder={"How long does onboarding take?\nWhat results can I expect?"}
                  rows={4}
                  className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                />
              </div>

              <div className="space-y-1.5 w-full">
                <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                  Most common objections (one per line)
                </label>
                <textarea
                  value={form.topObjections}
                  onChange={(e) => set("topObjections", e.target.value)}
                  placeholder={"It's too expensive for our budget right now.\nThe timing doesn't work for us right now."}
                  rows={4}
                  className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors shadow-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                    Testimonials (optional)
                  </label>
                  <p className="text-[11px] mt-0.5 opacity-85" style={{ color: "var(--text-muted)" }}>
                    Shown on the confirmation page as social proof. Skip this and the page ships without that section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addTestimonial}
                  className="px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer border bg-background/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 shadow-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  + Add testimonial
                </button>
              </div>

              {form.testimonials.map((t, i) => (
                <div key={i} className="grid gap-3 grid-cols-1 md:grid-cols-2 rounded-lg p-3 shadow-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <InputField
                    label="Name"
                    value={t.name}
                    onChange={(v) => updateTestimonial(i, "name", v)}
                    placeholder="e.g. Jamie Chen"
                  />
                  <InputField
                    label="Role"
                    value={t.role}
                    onChange={(v) => updateTestimonial(i, "role", v)}
                    placeholder="e.g. Head of Growth"
                  />
                  <InputField
                    label="Company (optional)"
                    value={t.company}
                    onChange={(v) => updateTestimonial(i, "company", v)}
                    placeholder="e.g. Acme Corp"
                  />
                  <div className="flex items-end font-mono">
                    <button
                      type="button"
                      onClick={() => removeTestimonial(i)}
                      className="px-3 py-1.5 text-xs font-bold rounded-md hover:opacity-80 transition-colors cursor-pointer"
                      style={{ color: "var(--error)" }}
                    >
                      [ Remove ]
                    </button>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>Quote</label>
                    <textarea
                      value={t.quote}
                      onChange={(e) => updateTestimonial(i, "quote", e.target.value)}
                      placeholder="What they said about working with this client..."
                      rows={2}
                      className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Review & Finish */}
        {step === "confirm" && (
          <div className="space-y-3 w-full">
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

            {error && (
              <p className="text-xs mt-2 font-mono font-semibold" style={{ color: "var(--error)" }}>
                ⚠ Error: {error}
              </p>
            )}
          </div>
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
    className="px-5 py-2 text-xs font-bold rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 shadow-xs active:translate-y-px"
  >
    Next
  </button>
) : (
  <button
    onClick={submit}
    disabled={
      submitting ||
      !form.buyerName ||
      !form.bookingApiKey ||
      !form.emailApiKey ||
      (form.emailPlatform === "klaviyo" && (!form.emailTargetListId || !form.emailRecoveryListId)) ||
      (form.emailPlatform === "activecampaign" && (!form.emailTargetListId || !form.emailRecoveryListId)) ||
      (form.emailPlatform === "mailchimp" && (!form.emailTargetListId || !form.emailRecoveryListId)) ||
      (form.emailPlatform === "convertkit" && (!form.emailTargetListId || !form.emailRecoveryListId)) ||
      (form.emailPlatform === "ghl" && (!form.emailGhlLocationId || !form.emailGhlTargetWorkflowId || !form.emailGhlRecoveryWorkflowId))
    }
    className="px-5 py-2 text-xs font-bold rounded-md transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
  >
    {submitting ? "Setting up..." : "Finish Setup"}
  </button>
)}
      </div>
    </div>
  );
}