"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_PLATFORM_LABELS,
  EMAIL_PLATFORM_LABELS,
  HOSTING_PLATFORM_LABELS,
  BRIEF_DESTINATION_LABELS,
} from "@/lib/copy";

type Step = "offer" | "stack" | "credentials" | "voice" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "offer", label: "Your Offer" },
  { id: "stack", label: "Connect Your Tools" },
  { id: "credentials", label: "Account Keys" },
  { id: "voice", label: "Your Brand Voice" },
  { id: "confirm", label: "Review & Finish" },
];

interface FormData {
  engagementId: string;
  buyerName: string;
  offerName: string;
  offerPrice: string;
  offerIcp: string;
  trafficTemperature: "cold" | "warm" | "hot";
  hybridMode: boolean;
  bookingPlatform: string;
  bookingOrgUri: string;
  bookingEventTypeUuid: string;
  bookingLocationId: string;
  emailPlatform: string;
  hostingPlatform: string;
  publishDomain: string;
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
  bookingOrgUri: "",
  bookingEventTypeUuid: "",
  bookingLocationId: "",
  emailPlatform: "klaviyo",
  hostingPlatform: "nextjs_vercel",
  publishDomain: "",
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
};

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
      <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
        {label} {required && <span className="ml-0.5" style={{ color: "var(--text-muted)" }}>(required)</span>}
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
        <p className="text-[11px] font-normal leading-normal" style={{ color: "var(--text-muted)" }}>{helpText}</p>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  helpText?: string;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md px-3 py-1.5 text-sm focus:outline-none transition-colors"
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
        <p className="text-[11px] font-normal leading-normal" style={{ color: "var(--text-muted)" }}>{helpText}</p>
      )}
    </div>
  );
}

export default function NewEngagementPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("offer");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    engagementId: string;
    confirmationPageUrl: string;
  } | null>(null);

  function set(field: keyof FormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
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
          organization_uri: form.bookingOrgUri,
          event_type_uuid: form.bookingEventTypeUuid,
          location_id: form.bookingLocationId,
        },
        email_platform: form.emailPlatform,
        email_platform_credentials_ref: `secrets://${engagementId}/${form.emailPlatform}_key`,
        hosting_platform: form.hostingPlatform,
        publish_domain: form.publishDomain,
        brief_landing_destination: form.briefDestination,
        slack_webhook_url: form.slackWebhookUrl,
        person_match_confidence_threshold: 99,
      },
      topCallQuestions: form.topCallQuestions
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean),
      topObjections: form.topObjections
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
      prospectMeets: form.prospectMeets,
      rawVoiceCorpus: form.rawVoiceCorpus,
      credentials: {
        booking: form.bookingApiKey,
        email: form.emailApiKey,
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

      setResult({
        engagementId: data.engagementId,
        confirmationPageUrl: data.confirmationPageUrl,
      });
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  // Success screen
  if (result) {
    return (
      <div className="space-y-6 w-full max-w-none px-1" style={{ color: "var(--text-secondary)" }}>
        <div className="rounded-lg p-5 space-y-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center space-x-2">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
              style={{ background: "var(--success)", color: "#04140f" }}
            >
              ✓
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Setup complete</span>
          </div>
          <p className="text-sm font-normal">
            This client's account is ready. Bookings will now flow in automatically, and their confirmation page is live and ready for prospects.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg p-4 space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Engagement ID</p>
            <p className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{result.engagementId}</p>
          </div>

          <div className="rounded-lg p-4 space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Confirmation Page Link</p>
            <a
              href={result.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm underline underline-offset-4 break-all block transition-colors"
              style={{ color: "var(--accent)" }}
            >
              {result.confirmationPageUrl}
            </a>
          </div>
        </div>

        <button
          onClick={() => router.push(`/dashboard/engagements/${result.engagementId}`)}
          className="px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Go to Client Dashboard
        </button>
      </div>
    );
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
              <>
                <InputField
                  label="Calendly Organization URL"
                  value={form.bookingOrgUri}
                  onChange={(v) => set("bookingOrgUri", v)}
                  placeholder="https://api.calendly.com/organizations/..."
                  helpText="Find this in Calendly under your organization settings."
                />
                <InputField
                  label="Event Type ID"
                  value={form.bookingEventTypeUuid}
                  onChange={(v) => set("bookingEventTypeUuid", v)}
                  placeholder="e.g. abc123xyz"
                  helpText="Identifies the specific call type to track — found in that event's Calendly link settings."
                />
              </>
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

            <SelectField
              label="Email Platform"
              value={form.emailPlatform}
              onChange={(v) => set("emailPlatform", v)}
              options={Object.entries(EMAIL_PLATFORM_LABELS).map(([value, label]) => ({ value, label }))}
              helpText="Where follow-up and win-back emails get sent from."
            />

            {(form.emailPlatform === "klaviyo" || form.emailPlatform === "activecampaign") && (
              <div
                className="md:col-span-2 rounded-lg p-3 text-xs"
                style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
              >
                Once you connect your {form.emailPlatform === "klaviyo" ? "Klaviyo" : "ActiveCampaign"} key in the next step, we'll automatically build the follow-up and win-back sequences for you — no list setup needed here.
              </div>
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
            />

            <InputField
              label="Website Domain"
              value={form.publishDomain}
              onChange={(v) => set("publishDomain", v)}
              placeholder="yoursite.com"
              helpText="Used to build the confirmation link people land on after booking."
            />
          </div>
        )}

        {/* Step: Account Keys */}
        {step === "credentials" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div className="md:col-span-2 text-xs">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>How we keep this secure</p>
              <p className="font-light mt-0.5" style={{ color: "var(--text-muted)" }}>
                Your keys are encrypted before they're stored, and aren't shown again once saved.
              </p>
            </div>
            <InputField
              label={`${BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform} API Key`}
              value={form.bookingApiKey}
              onChange={(v) => set("bookingApiKey", v)}
              type="password"
              placeholder="Paste your API key here..."
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
          </div>
        )}

        {/* Step: Your Brand Voice */}
        {step === "voice" && (
          <div className="space-y-6 w-full">
            <div className="space-y-2">
              <label className="text-xs font-medium block" style={{ color: "var(--text-primary)" }}>
                How should we learn this client's voice?
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
                ["Brief Delivery", BRIEF_DESTINATION_LABELS[form.briefDestination] ?? form.briefDestination],
                ["Brand Voice Sample", `${form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words`],
                ["Call Questions Added", `${form.topCallQuestions.split("\n").filter(Boolean).length}`],
                ["Objections Added", `${form.topObjections.split("\n").filter(Boolean).length}`],
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
            disabled={submitting || !form.buyerName || !form.bookingApiKey}
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