"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "offer" | "stack" | "credentials" | "voice" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "offer", label: "Offer" },
  { id: "stack", label: "Stack" },
  { id: "credentials", label: "Credentials" },
  { id: "voice", label: "Voice" },
  { id: "confirm", label: "Confirm" },
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
  targetListId: string;
  recoveryListId: string;
  slackWebhookUrl: string;
  topCallQuestions: string;
  topObjections: string;
  prospectMeets: string;
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
  targetListId: "",
  recoveryListId: "",
  slackWebhookUrl: "",
  topCallQuestions: "",
  topObjections: "",
  prospectMeets: "founder",
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
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-mono font-medium border ${
              i < currentIdx
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : i === currentIdx
                ? "bg-zinc-100 text-zinc-950 border-zinc-100"
                : "bg-zinc-900 text-zinc-600 border-zinc-800"
            }`}
          >
            {i < currentIdx ? "✓" : i + 1}
          </div>
          <span
            className={`text-[10px] font-mono ${
              i === currentIdx ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-6 ${
                i < currentIdx ? "bg-zinc-700" : "bg-zinc-900"
              }`}
            />
          )}
        </div>
      ))}
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
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
      />
      {helpText && (
        <p className="text-[10px] text-zinc-600">{helpText}</p>
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
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {helpText && (
        <p className="text-[10px] text-zinc-600">{helpText}</p>
      )}
    </div>
  );
}

export default function PinDownWizardPage() {
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
      whopUserId: "from_session", // session is read server-side via route auth
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
        target_list_id: form.targetListId,
        recovery_list_id: form.recoveryListId,
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

  if (result) {
    return (
      <div className="max-w-xl space-y-6">
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <p className="text-sm font-medium text-emerald-400">
              Pin-Down complete
            </p>
          </div>
          <p className="text-xs text-zinc-400 font-light">
            Your engagement has been created. The webhook is registered and the
            confirmation page is live. The other four skills are now ready to
            run.
          </p>
        </div>

        <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-2">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Engagement ID
          </p>
          <p className="font-mono text-xs text-zinc-200">{result.engagementId}</p>
        </div>

        <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-2">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            Confirmation Page URL
          </p>
          <a
            href={result.confirmationPageUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-zinc-300 underline underline-offset-2 hover:text-zinc-100 break-all"
          >
            {result.confirmationPageUrl}
          </a>
          <p className="text-[10px] text-zinc-600">
            This URL has been set as your post-booking redirect in{" "}
            {form.bookingPlatform}.
          </p>
        </div>

        <button
          onClick={() => router.push(`/dashboard/engagements/${result.engagementId}`)}
          className="px-4 py-2 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 transition-colors"
        >
          VIEW ENGAGEMENT →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="pb-2 border-b border-zinc-900">
        <h1 className="text-xl font-medium tracking-tighter text-zinc-100">
          Pin-Down Setup
        </h1>
        <p className="text-[11px] font-light text-zinc-500 mt-1">
          One-time configuration. Creates your engagement, extracts your brand
          voice, and wires your booking platform webhooks automatically.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      <div className="rounded border border-zinc-900 bg-zinc-950/40 p-5 space-y-5">
        {/* Step: Offer */}
        {step === "offer" && (
          <>
            <h2 className="text-xs font-medium text-zinc-300">
              Offer details
            </h2>
            <InputField
              label="Your name / company"
              value={form.buyerName}
              onChange={(v) => set("buyerName", v)}
              placeholder="Acme Corp"
              required
            />
            <InputField
              label="Offer name"
              value={form.offerName}
              onChange={(v) => set("offerName", v)}
              placeholder="High-Ticket Coaching Program"
              required
            />
            <InputField
              label="Price"
              value={form.offerPrice}
              onChange={(v) => set("offerPrice", v)}
              placeholder="$5,000"
            />
            <InputField
              label="Ideal customer profile (ICP)"
              value={form.offerIcp}
              onChange={(v) => set("offerIcp", v)}
              placeholder="SaaS founders doing $1M–$10M ARR with a sales team of 2–5"
            />
            <SelectField
              label="Traffic temperature"
              value={form.trafficTemperature}
              onChange={(v) => set("trafficTemperature", v)}
              options={[
                { value: "cold", label: "Cold — paid ads, outbound" },
                { value: "warm", label: "Warm — content, referrals" },
                { value: "hot", label: "Hot — existing community, high intent" },
              ]}
            />
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="hybrid"
                checked={form.hybridMode}
                onChange={(e) => set("hybridMode", e.target.checked)}
                className="accent-zinc-200"
              />
              <label htmlFor="hybrid" className="text-xs text-zinc-400">
                Enable hybrid mode (AI-personalized confirmation emails per booking)
              </label>
            </div>
            <InputField
              label="Who the prospect meets"
              value={form.prospectMeets}
              onChange={(v) => set("prospectMeets", v)}
              placeholder="founder"
              helpText="e.g. founder, closer, account executive"
            />
          </>
        )}

        {/* Step: Stack */}
        {step === "stack" && (
          <>
            <h2 className="text-xs font-medium text-zinc-300">
              Platform stack
            </h2>
            <SelectField
              label="Booking platform"
              value={form.bookingPlatform}
              onChange={(v) => set("bookingPlatform", v)}
              options={[
                { value: "calendly", label: "Calendly" },
                { value: "cal_com", label: "Cal.com" },
                { value: "ghl_calendar", label: "GoHighLevel Calendar" },
                { value: "oncehub", label: "OnceHub" },
              ]}
            />
            {form.bookingPlatform === "calendly" && (
              <>
                <InputField
                  label="Organization URI"
                  value={form.bookingOrgUri}
                  onChange={(v) => set("bookingOrgUri", v)}
                  placeholder="https://api.calendly.com/organizations/AAAA..."
                  helpText="From Calendly API → GET /users/me → current_organization"
                />
                <InputField
                  label="Event type UUID"
                  value={form.bookingEventTypeUuid}
                  onChange={(v) => set("bookingEventTypeUuid", v)}
                  placeholder="abc123..."
                  helpText="The UUID of the event type where prospects book calls"
                />
              </>
            )}
            {form.bookingPlatform === "ghl_calendar" && (
              <InputField
                label="GHL Location ID"
                value={form.bookingLocationId}
                onChange={(v) => set("bookingLocationId", v)}
                placeholder="abc123..."
              />
            )}
            <SelectField
              label="Email / CRM platform"
              value={form.emailPlatform}
              onChange={(v) => set("emailPlatform", v)}
              options={[
                { value: "klaviyo", label: "Klaviyo" },
                { value: "hubspot", label: "HubSpot" },
                { value: "activecampaign", label: "ActiveCampaign" },
                { value: "ghl", label: "GoHighLevel CRM" },
              ]}
            />
            {(form.emailPlatform === "klaviyo" ||
              form.emailPlatform === "activecampaign") && (
              <>
                <InputField
                  label="Pre-call sequence list ID"
                  value={form.targetListId}
                  onChange={(v) => set("targetListId", v)}
                  placeholder="ABC123"
                  helpText="The list/sequence new bookings are enrolled into"
                />
                <InputField
                  label="Win-back recovery list ID"
                  value={form.recoveryListId}
                  onChange={(v) => set("recoveryListId", v)}
                  placeholder="XYZ789"
                  helpText="The list/sequence cancelled/no-show prospects enter"
                />
              </>
            )}
            <SelectField
              label="Brief delivery destination"
              value={form.briefDestination}
              onChange={(v) => set("briefDestination", v)}
              options={[
                { value: "slack", label: "Slack" },
                { value: "crm_note", label: "CRM note" },
              ]}
            />
            {form.briefDestination === "slack" && (
              <InputField
                label="Slack incoming webhook URL"
                value={form.slackWebhookUrl}
                onChange={(v) => set("slackWebhookUrl", v)}
                placeholder="https://hooks.slack.com/services/..."
                helpText="From api.slack.com → Your Apps → Incoming Webhooks"
              />
            )}
            <SelectField
              label="Hosting platform"
              value={form.hostingPlatform}
              onChange={(v) => set("hostingPlatform", v)}
              options={[
                { value: "nextjs_vercel", label: "Next.js / Vercel (this app)" },
                { value: "webflow", label: "Webflow" },
                { value: "ghl", label: "GoHighLevel Funnels" },
                { value: "wordpress", label: "WordPress" },
                { value: "plain_html", label: "Plain HTML" },
              ]}
            />
            <InputField
              label="Your domain"
              value={form.publishDomain}
              onChange={(v) => set("publishDomain", v)}
              placeholder="yoursite.com"
              helpText="Used to construct the confirmation page URL"
            />
          </>
        )}

        {/* Step: Credentials */}
        {step === "credentials" && (
          <>
            <h2 className="text-xs font-medium text-zinc-300">
              API credentials
            </h2>
            <p className="text-[11px] text-zinc-500 font-light">
              Keys are encrypted with AES-256-GCM before storage. They are
              never logged or accessible to anyone including Mudd staff.
            </p>
            <InputField
              label={`${form.bookingPlatform} API key / token`}
              value={form.bookingApiKey}
              onChange={(v) => set("bookingApiKey", v)}
              type="password"
              placeholder="Paste your key here"
              required
            />
            <InputField
              label={`${form.emailPlatform} API key`}
              value={form.emailApiKey}
              onChange={(v) => set("emailApiKey", v)}
              type="password"
              placeholder="Paste your key here"
              required
            />
          </>
        )}

        {/* Step: Voice */}
        {step === "voice" && (
          <>
            <h2 className="text-xs font-medium text-zinc-300">
              Brand voice extraction
            </h2>
            <p className="text-[11px] text-zinc-500 font-light">
              Paste at least 500 words of your existing copy — sales page,
              emails, social posts, video transcripts. The more the better.
              This shapes the tone of every email and brief the system
              generates.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Marketing copy corpus
              </label>
              <textarea
                value={form.rawVoiceCorpus}
                onChange={(e) => set("rawVoiceCorpus", e.target.value)}
                placeholder="Paste your sales page, email sequences, video transcripts..."
                rows={10}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-y"
              />
              <p className="text-[10px] text-zinc-600">
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length}{" "}
                words pasted.
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length < 500
                  ? " Need at least 500 for accurate extraction."
                  : " ✓"}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Top call questions (one per line)
              </label>
              <textarea
                value={form.topCallQuestions}
                onChange={(e) => set("topCallQuestions", e.target.value)}
                placeholder={"How much is the investment?\nWhat results can I expect?\nHow long does it take?"}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Top objections (one per line)
              </label>
              <textarea
                value={form.topObjections}
                onChange={(e) => set("topObjections", e.target.value)}
                placeholder={"I need to think about it.\nI need to talk to my partner.\nNow isn't the right time."}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-y"
              />
            </div>
          </>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <>
            <h2 className="text-xs font-medium text-zinc-300">
              Review and launch
            </h2>
            <div className="space-y-2 text-[11px] font-light">
              {[
                ["Buyer", form.buyerName],
                ["Offer", form.offerName],
                ["Price", form.offerPrice],
                ["Booking platform", form.bookingPlatform],
                ["Email platform", form.emailPlatform],
                ["Brief destination", form.briefDestination],
                ["Corpus words", form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length.toString()],
                ["Call questions", form.topCallQuestions.split("\n").filter(Boolean).length.toString()],
                ["Objections", form.topObjections.split("\n").filter(Boolean).length.toString()],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-zinc-900 pb-1">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-300 font-mono">{value || "—"}</span>
                </div>
              ))}
            </div>
            {error && (
              <div className="rounded border border-rose-500/20 bg-rose-500/5 p-3">
                <p className="text-[11px] text-rose-400 font-mono">{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === step);
            if (idx > 0) setStep(STEPS[idx - 1].id);
          }}
          disabled={step === "offer"}
          className="px-4 py-2 text-[10px] font-mono font-medium border border-zinc-800 text-zinc-400 rounded hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          ← BACK
        </button>

        {step !== "confirm" ? (
          <button
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
            }}
            className="px-4 py-2 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 transition-colors"
          >
            NEXT →
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !form.buyerName || !form.bookingApiKey}
            className="px-4 py-2 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "RUNNING PIN-DOWN..." : "LAUNCH →"}
          </button>
        )}
      </div>
    </div>
  );
}