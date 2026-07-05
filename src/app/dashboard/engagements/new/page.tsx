"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_PLATFORM_LABELS,
  EMAIL_PLATFORM_LABELS,
  HOSTING_PLATFORM_LABELS,
  BRIEF_DESTINATION_LABELS,
} from "@/lib/copy";

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
  emailPlatform: string;
  emailTargetListId: string;
  emailRecoveryListId: string;
  emailActiveCampaignBaseUrl: string;
  emailGhlLocationId: string;
  emailGhlTargetWorkflowId: string;
  emailGhlRecoveryWorkflowId: string;
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
  topCallQuestions: string;
  topObjections: string;
  prospectMeets: string;
  voiceSource: "scrape" | "manual";
  marketingDomain: string;
  rawVoiceCorpus: string;
  bookingApiKey: string;
  emailApiKey: string;
  testimonials: Testimonial[];
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
  emailTargetListId: "",
  emailRecoveryListId: "",
  emailActiveCampaignBaseUrl: "",
  emailGhlLocationId: "",
  emailGhlTargetWorkflowId: "",
  emailGhlRecoveryWorkflowId: "",
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
  topCallQuestions: "",
  topObjections: "",
  prospectMeets: "founder",
  voiceSource: "scrape",
  marketingDomain: "",
  rawVoiceCorpus: "",
  bookingApiKey: "",
  emailApiKey: "",
  testimonials: [],
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
    const { bookingApiKey, emailApiKey, hostingApiKey, ...safeToStore } = form;
    void bookingApiKey;
    void emailApiKey;
    void hostingApiKey;
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
    <div className="space-y-3 select-none">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          {steps[currentIdx].label}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          Step {currentIdx + 1} of {steps.length}
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
        className="text-xs font-medium block"
        style={{ color: "var(--text-primary)" }}
      >
        {label}{" "}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--text-muted)" }}>
            (required)
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none"
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
          className="text-[11px] font-normal leading-normal"
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
        className="text-xs font-medium block"
        style={{ color: "var(--text-primary)" }}
      >
        {label}{" "}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--text-muted)" }}>
            (required)
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md px-3 py-1.5 text-sm focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {helpText && (
        <p
          className="text-[11px] font-normal leading-normal"
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

  function set(field: keyof FormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function discardDraft() {
    clearDraft();
    setForm(DEFAULT_FORM);
    setStep("offer");
    setShowRestoredBanner(false);
  }

  // Draft autosave: keeps onboarding progress across an accidental refresh
  // or back/forward navigation. API keys are stripped before storage inside
  // saveDraft, so nothing sensitive ends up in sessionStorage.
  useEffect(() => {
    saveDraft(form, step);
  }, [form, step]);

  // Klaviyo: Fetch lists
  //
  // The missing-key case used to be handled inside this effect via
  // `setListsFetchError(...); return;` — a synchronous setState call with
  // no actual effect work (no fetch, no subscription) behind it. React
  // flags that specific shape ("effect body does nothing but call
  // setState") as a candidate for cascading renders. It's derived state,
  // not an effect's job — see klaviyoMissingKeyMessage below, computed
  // directly during render instead. The effect itself now only ever runs
  // when there's real async work (the fetch) to do, matching the same
  // shape as the ActiveCampaign/GHL effects right below it.
  useEffect(() => {
    if (step === "stack" && form.emailPlatform === "klaviyo" && form.emailApiKey.trim()) {
      setFetchingLists(true);
      setListsFetchError(null);

      fetch(`/api/integrations/klaviyo/lists?key=${encodeURIComponent(form.emailApiKey.trim())}`)
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

      fetch(
        `/api/integrations/activecampaign/lists?key=${encodeURIComponent(form.emailApiKey.trim())}&baseUrl=${encodeURIComponent(form.emailActiveCampaignBaseUrl.trim())}`
      )
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

  // GHL: Fetch locations
  useEffect(() => {
    if (step === "stack" && form.emailPlatform === "ghl" && form.emailApiKey.trim()) {
      setFetchingGhlLocations(true);
      setGhlLocationsError(null);
      setGhlWorkflows([]);
      setForm((f) => ({ ...f, emailGhlTargetWorkflowId: "", emailGhlRecoveryWorkflowId: "" }));

      fetch(`/api/integrations/ghl/locations?key=${encodeURIComponent(form.emailApiKey.trim())}`)
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

      fetch(
        `/api/integrations/ghl/workflows?key=${encodeURIComponent(form.emailApiKey.trim())}&locationId=${encodeURIComponent(form.emailGhlLocationId)}`
      )
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

  // Derived, not state: this used to be set via a synchronous setState call
  // inside the Klaviyo effect above with no actual async work behind it —
  // exactly the pattern React's "you might not need an effect" guidance
  // warns about. It's a pure function of form.emailPlatform/emailApiKey,
  // so it's computed directly here instead.
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
      testimonials: f.testimonials.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  function removeTestimonial(index: number) {
    setForm((f) => ({
      ...f,
      testimonials: f.testimonials.filter((_, i) => i !== index),
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
      },
      stack: {
        booking_platform: form.bookingPlatform,
        booking_platform_credentials_ref: `secrets://${engagementId}/${form.bookingPlatform}_pat`,
        booking_platform_meta: {
          ...(form.bookingPlatform === "ghl_calendar" && {
            location_id: form.bookingLocationId,
          }),
        },
        booking_standing_link: form.bookingStandingLink || undefined,
        email_platform: form.emailPlatform,
        email_platform_credentials_ref: `secrets://${engagementId}/${form.emailPlatform}_key`,
        email_platform_meta: Object.keys(emailPlatformMeta).length > 0 ? emailPlatformMeta : undefined,
        hosting_platform: form.hostingPlatform,
        hosting_platform_credentials_ref: `secrets://${engagementId}/${form.hostingPlatform}_key`,
        publish_domain: form.publishDomain,
        hosting_platform_meta: hostingMetaByPlatform[form.hostingPlatform] ?? undefined,
        brief_landing_destination: form.briefDestination,
        slack_webhook_url: form.slackWebhookUrl,
        person_match_confidence_threshold: 99,
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

      // Setup now runs asynchronously (see the comment on
      // /api/engagements/setup/route.ts for why) — this response only
      // means "the run started," not "setup finished." Redirect straight
      // to the run-detail page, which already polls live, shows the step
      // timeline, and handles failure/timeout — the exact same view Live
      // Executions already links to, so this is one consistent experience
      // instead of a second, parallel "please wait" screen.
      clearDraft();
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
    <div className="space-y-6 w-full max-w-none px-1" style={{ color: "var(--text-secondary)" }}>
      {/* Header */}
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-medium tracking-tight" style={{ color: "var(--text-primary)" }}>
          Set Up a New Client
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          A one-time setup. Connect their booking calendar and email tool, and teach the system their brand voice — everything below runs automatically after this.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {showRestoredBanner && (
        <div
          className="rounded-lg p-3 flex items-center justify-between gap-3 text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            Restored your in-progress setup from before the last refresh. API keys were not saved and need to be re-entered.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowRestoredBanner(false)}
              className="px-2 py-1 rounded"
              style={{ color: "var(--text-secondary)" }}
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-2 py-1 rounded"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
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

            <div className="flex items-center space-x-3 pt-4 select-none md:col-span-1">
              <input
                type="checkbox"
                id="hybrid"
                checked={form.hybridMode}
                onChange={(e) => set("hybridMode", e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", accentColor: "var(--accent)" }}
              />
              <label htmlFor="hybrid" className="text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                Personalize each booking confirmation using AI, based on who booked the call.
              </label>
            </div>
          </div>
        )}

        {/* Step: Account Keys */}
        {step === "credentials" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div className="md:col-span-2 text-xs">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>How we keep this secure</p>
              <p className="font-light mt-0.5" style={{ color: "var(--text-muted)" }}>
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
            <InputField
              label={`${EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform} API Key`}
              value={form.emailApiKey}
              onChange={(v) => set("emailApiKey", v)}
              type="password"
              placeholder="Paste your API key here..."
              required
            />
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
              <div className="md:col-span-2 rounded-lg p-3 text-xs" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                ✨ <strong>Zero-Config Mode Active:</strong> You don&apos;t need to look up or paste any obscure organization links or event IDs. We automatically detect your workspace parameters on the backend.
              </div>
            )}

            {form.bookingPlatform === "cal_com" && (
              <div className="md:col-span-2 rounded-lg p-3 text-xs" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                ✨ <strong>Zero-Config Mode Active:</strong> We will automatically parse your account profile username and numerical event type ID from the standing link behind the scenes.
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
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 animate-pulse">
                    ⚡ Contacting Klaviyo... Synchronizing list profiles indexes...
                  </div>
                )}
                {(klaviyoMissingKeyMessage ?? listsFetchError) && (
                  <div className="md:col-span-2 rounded p-3 text-xs bg-rose-950/20 text-rose-400 font-mono">
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
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 animate-pulse">
                    ⚡ Contacting ActiveCampaign... Fetching audience lists...
                  </div>
                )}
                {acListsError && (
                  <div className="md:col-span-2 rounded p-3 text-xs bg-rose-950/20 text-rose-400 font-mono">
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
              </>
            )}

            {form.emailPlatform === "ghl" && (
              <>
                {fetchingGhlLocations && (
                  <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 animate-pulse">
                    ⚡ Contacting GoHighLevel... Fetching locations...
                  </div>
                )}
                {ghlLocationsError && (
                  <div className="md:col-span-2 rounded p-3 text-xs bg-rose-950/20 text-rose-400 font-mono">
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
                      <div className="md:col-span-2 text-xs italic font-mono text-zinc-500 animate-pulse">
                        ⚡ Loading workflows for selected location...
                      </div>
                    )}
                    {ghlWorkflowsError && (
                      <div className="md:col-span-2 rounded p-3 text-xs bg-rose-950/20 text-rose-400 font-mono">
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
              <div className="md:col-span-2 rounded-lg p-3 text-xs" style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}>
                {form.hostingPlatform === "ghl"
                  ? "GoHighLevel's funnel builder doesn't support automatic publishing yet. We'll generate the page as ready-to-paste HTML with step-by-step instructions instead."
                  : "Plain HTML sites are published manually. We'll generate a self-contained HTML file the client uploads to their own host."}
              </div>
            )}
          </div>
        )}

        {/* Step: Your Brand Voice */}
        {step === "voice" && (
          <div className="space-y-6 w-full">
            <div className="space-y-2">
              <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                How should we learn this client&apos;s voice?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set("voiceSource", "scrape")}
                  className="flex-1 text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
                  style={{
                    background: form.voiceSource === "scrape" ? "var(--accent-dim)" : "var(--surface)",
                    border: `1px solid ${form.voiceSource === "scrape" ? "var(--accent)" : "var(--border)"}`,
                    color: "var(--text-primary)",
                  }}
                >
                  <span className="font-medium">Scrape their website</span>
                  <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>
                    We read their site and recent emails automatically. Rolling out — recommended to also paste a sample below for now.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => set("voiceSource", "manual")}
                  className="flex-1 text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
                  style={{
                    background: form.voiceSource === "manual" ? "var(--accent-dim)" : "var(--surface)",
                    border: `1px solid ${form.voiceSource === "manual" ? "var(--accent)" : "var(--border)"}`,
                    color: "var(--text-primary)",
                  }}
                >
                  <span className="font-medium">Paste a writing sample</span>
                  <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>
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
                helpText="We'll crawl this site once automatic scraping is live for your account."
              />
            )}

            <div className="space-y-1.5 w-full">
              <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                Sales copy, scripts, or call transcripts (500 words minimum)
              </label>
              <textarea
                value={form.rawVoiceCorpus}
                onChange={(e) => set("rawVoiceCorpus", e.target.value)}
                placeholder="Paste sales call transcripts, email copy, or scripts here..."
                rows={8}
                className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              />
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words pasted.{" "}
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length < 500
                  ? "Add more — at least 500 words are needed to learn the brand voice accurately."
                  : "✓ That's enough to learn the brand voice."}
              </p>
            </div>

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              <div className="space-y-1.5 w-full">
                <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                  Most common questions on calls (one per line)
                </label>
                <textarea
                  value={form.topCallQuestions}
                  onChange={(e) => set("topCallQuestions", e.target.value)}
                  placeholder={"How long does onboarding take?\nWhat results can I expect?"}
                  rows={4}
                  className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                />
              </div>

              <div className="space-y-1.5 w-full">
                <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                  Most common objections (one per line)
                </label>
                <textarea
                  value={form.topObjections}
                  onChange={(e) => set("topObjections", e.target.value)}
                  placeholder={"It's too expensive for our budget right now.\nThe timing doesn't work for us right now."}
                  rows={4}
                  className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                    Testimonials (optional)
                  </label>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Shown on the confirmation page as social proof. Skip this and the page ships without that section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addTestimonial}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer shrink-0"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  + Add testimonial
                </button>
              </div>

              {form.testimonials.map((t, i) => (
                <div key={i} className="grid gap-3 grid-cols-1 md:grid-cols-2 rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
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
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeTestimonial(i)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
                      style={{ color: "var(--error)" }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>Quote</label>
                    <textarea
                      value={t.quote}
                      onChange={(e) => updateTestimonial(i, "quote", e.target.value)}
                      placeholder="What they said about working with this client..."
                      rows={2}
                      className="w-full rounded-md px-3 py-2 text-xs resize-y focus:outline-none transition-colors"
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
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Review your setup</h2>
            <div className="text-xs font-sans space-y-2 rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {[
                ["Client", form.buyerName],
                ["Offer", form.offerName],
                ["Price", form.offerPrice || "—"],
                ["Booking Calendar", BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform],
                ["Email Platform", EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform],
                ["Confirmation Page Hosting", HOSTING_PLATFORM_LABELS[form.hostingPlatform] ?? form.hostingPlatform],
                ["Brief Delivery", BRIEF_DESTINATION_LABELS[form.briefDestination] ?? form.briefDestination],
                ["Brand Voice Sample", `${form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words`],
                ["Call Questions Added", `${form.topCallQuestions.split("\n").filter(Boolean).length}`],
                ["Objections Added", `${form.topObjections.split("\n").filter(Boolean).length}`],
                ["Testimonials Added", `${form.testimonials.filter((t) => t.name && t.role && t.quote).length}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between pb-1.5 last:pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>{value}</span>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-xs mt-2" style={{ color: "var(--error)" }}>
                Something went wrong: {error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === step);
            if (idx > 0) setStep(STEPS[idx - 1].id);
          }}
          disabled={step === "offer"}
          className="px-4 py-1.5 text-xs font-medium rounded-md disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          Back
        </button>

        {step !== "confirm" ? (
          <button
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
            }}
            className="px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
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
              (form.emailPlatform === "ghl" && (!form.emailGhlLocationId || !form.emailGhlTargetWorkflowId || !form.emailGhlRecoveryWorkflowId))
            }
            className="px-4 py-1.5 text-xs font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting ? "Setting up..." : "Finish Setup"}
          </button>
        )}
      </div>
    </div>
  );
}