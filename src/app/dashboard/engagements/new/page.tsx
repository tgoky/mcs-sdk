"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "offer" | "stack" | "credentials" | "voice" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "offer", label: "Offer Details" },
  { id: "stack", label: "Platform Stack" },
  { id: "credentials", label: "API Credentials" },
  { id: "voice", label: "Voice Extraction" },
  { id: "confirm", label: "Final Review" },
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 select-none border-b border-zinc-900 pb-4">
      {steps.map((step, i) => {
        const isComplete = i < currentIdx;
        const isActive = i === currentIdx;

        return (
          <div key={step.id} className="flex items-center space-x-2 text-xs">
            <span className={`font-mono ${
              isComplete ? "text-zinc-400" : isActive ? "text-zinc-100 font-medium" : "text-zinc-600"
            }`}>
              {isComplete ? "[✓]" : isActive ? "[•]" : "[ ]"} {step.label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-zinc-800 font-mono">/</span>
            )}
          </div>
        );
      })}
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
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
        {label} {required && <span className="text-zinc-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-700"
      />
      {helpText && (
        <p className="text-[11px] text-zinc-600 font-normal italic leading-normal">{helpText}</p>
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
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {helpText && (
        <p className="text-[11px] text-zinc-600 font-normal italic leading-normal">{helpText}</p>
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
        setError(data.error ?? "Setup failed. Check fields and try again.");
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

  // Success Confirmation Screen
  if (result) {
    return (
      <div className="space-y-6 w-full max-w-none px-1 text-zinc-400">
        <div className="border border-zinc-900 bg-zinc-950/20 p-5 rounded-lg space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-zinc-200 uppercase">[ PIPELINE_STATUS // LIVE ]</span>
          </div>
          <p className="text-sm text-zinc-400 font-normal">
            Account framework successfully synchronized. Webhook routing has been initialized and the public confirmation template is online. Remaining pack sub-modules are ready for processing loops.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-lg space-y-1">
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Engagement ID</p>
            <p className="font-mono text-sm text-zinc-200">{result.engagementId}</p>
          </div>

          <div className="border border-zinc-900 bg-zinc-950/20 p-4 rounded-lg space-y-1">
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Confirmation Route URL</p>
            <a
              href={result.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-zinc-300 underline underline-offset-4 hover:text-zinc-100 break-all block"
            >
              {result.confirmationPageUrl}
            </a>
          </div>
        </div>

        <button
          onClick={() => router.push(`/dashboard/engagements/${result.engagementId}`)}
          className="px-4 py-2 text-xs font-mono font-normal border border-zinc-800 text-zinc-300 rounded hover:border-zinc-600 hover:text-zinc-100 transition-colors uppercase tracking-wider bg-zinc-900/10 cursor-pointer"
        >
          [ Access Deployment Node ]
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-none px-1 text-zinc-400">
      
      {/* Header */}
      <div className="pb-3 border-b border-zinc-900">
        <h1 className="text-lg font-medium tracking-tight text-zinc-100">
          Pin-Down Setup Pipeline
        </h1>
        <p className="text-xs font-normal text-zinc-500 mt-0.5">
          One-time infrastructure configuration. Initializes the client asset node, maps the tracking framework, and registers data hook integrations.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {/* FIXED: Shifted interior layout block to a clean full-width background surface */}
      <div className="bg-transparent space-y-6 pt-2">
        
        {/* Step: Offer Details */}
        {step === "offer" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <InputField
              label="Buyer Identifier / Company Name"
              value={form.buyerName}
              onChange={(v) => set("buyerName", v)}
              placeholder="e.g. Acme Corporation"
              required
            />
            <InputField
              label="Core Offer Title"
              value={form.offerName}
              onChange={(v) => set("offerName", v)}
              placeholder="e.g. Enterprise Consulting Structure"
              required
            />
            <InputField
              label="Financial Price Value"
              value={form.offerPrice}
              onChange={(v) => set("offerPrice", v)}
              placeholder="e.g. $10,000"
            />
            <SelectField
              label="Funnel Traffic Temperature"
              value={form.trafficTemperature}
              onChange={(v) => set("trafficTemperature", v)}
              options={[
                { value: "cold", label: "Cold — Outbound streams / paid tracking" },
                { value: "warm", label: "Warm — Inbound content assets / referrals" },
                { value: "hot", label: "Hot — Existing verified network lists" },
              ]}
            />
            <div className="md:col-span-2">
              <InputField
                label="Ideal Customer Profile (ICP) Parameters"
                value={form.offerIcp}
                onChange={(v) => set("offerIcp", v)}
                placeholder="e.g. B2B operators managing ARR benchmarks from $1M-$10M"
              />
            </div>
            <InputField
              label="Assigned Meeting Representative Role"
              value={form.prospectMeets}
              onChange={(v) => set("prospectMeets", v)}
              placeholder="e.g. Lead Strategist"
              helpText="Specify internal role assignment (e.g., closer, executive account lead)."
            />
            
            <div className="flex items-center space-x-3 pt-4 select-none md:col-span-1">
              <input
                type="checkbox"
                id="hybrid"
                checked={form.hybridMode}
                onChange={(e) => set("hybridMode", e.target.checked)}
                className="w-4 h-4 bg-zinc-950 border border-zinc-900 rounded accent-zinc-200"
              />
              <label htmlFor="hybrid" className="text-xs text-zinc-400 cursor-pointer">
                Enable contextual AI personalization parameters per inbound booking event.
              </label>
            </div>
          </div>
        )}

        {/* Step: Platform Stack */}
        {step === "stack" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <SelectField
              label="Calendar Booking Infrastructure Engine"
              value={form.bookingPlatform}
              onChange={(v) => set("bookingPlatform", v)}
              options={[
                { value: "calendly", label: "Calendly Integration Service" },
                { value: "cal_com", label: "Cal.com Platform Engine" },
                { value: "ghl_calendar", label: "GoHighLevel Calendar Module" },
                { value: "oncehub", label: "OnceHub Router Link" },
              ]}
            />

            {form.bookingPlatform === "calendly" && (
              <>
                <InputField
                  label="Calendly Organization URI Token"
                  value={form.bookingOrgUri}
                  onChange={(v) => set("bookingOrgUri", v)}
                  placeholder="https://api.calendly.com/organizations/..."
                  helpText="Extracted from the workspace metadata payload."
                />
                <InputField
                  label="Target Event Type UUID"
                  value={form.bookingEventTypeUuid}
                  onChange={(v) => set("bookingEventTypeUuid", v)}
                  placeholder="e.g. abc123xyz"
                  helpText="The alphanumeric sequence mapping specific call instances."
                />
              </>
            )}

            {form.bookingPlatform === "ghl_calendar" && (
              <InputField
                label="GHL Location Account Identifier"
                value={form.bookingLocationId}
                onChange={(v) => set("bookingLocationId", v)}
                placeholder="e.g. loc_abc123"
              />
            )}

            <SelectField
              label="CRM / Core Distribution Email Platform"
              value={form.emailPlatform}
              onChange={(v) => set("emailPlatform", v)}
              options={[
                { value: "klaviyo", label: "Klaviyo Flow Architecture" },
                { value: "hubspot", label: "HubSpot Communications Engine" },
                { value: "activecampaign", label: "ActiveCampaign Pipeline" },
                { value: "ghl", label: "GoHighLevel Central CRM" },
              ]}
            />

            {(form.emailPlatform === "klaviyo" || form.emailPlatform === "activecampaign") && (
              <>
                <InputField
                  label="Pre-Call Automation List ID"
                  value={form.targetListId}
                  onChange={(v) => set("targetListId", v)}
                  placeholder="e.g. LIST_01"
                  helpText="Target sequence group where inbound entries enroll."
                />
                <InputField
                  label="Recovery Sequence List ID"
                  value={form.recoveryListId}
                  onChange={(v) => set("recoveryListId", v)}
                  placeholder="e.g. LIST_02"
                  helpText="Terminal sequence bucket for cancelled or missing records."
                />
              </>
            )}

            <SelectField
              label="Closer Brief Landing Target"
              value={form.briefDestination}
              onChange={(v) => set("briefDestination", v)}
              options={[
                { value: "slack", label: "Slack DM / Workspace Matrix Channel" },
                { value: "crm_note", label: "CRM Internal Profile Timeline Note" },
              ]}
            />

            {form.briefDestination === "slack" && (
              <InputField
                label="Slack Incoming Webhook Endpoint"
                value={form.slackWebhookUrl}
                onChange={(v) => set("slackWebhookUrl", v)}
                placeholder="https://hooks.slack.com/services/..."
                helpText="Workspace app routing configuration endpoint."
              />
            )}

            <SelectField
              label="Confirmation Route Hosting Platform"
              value={form.hostingPlatform}
              onChange={(v) => set("hostingPlatform", v)}
              options={[
                { value: "nextjs_vercel", label: "Next.js Architecture on Vercel Node" },
                { value: "webflow", label: "Webflow Layout Engine" },
                { value: "ghl", label: "GoHighLevel Funnel Matrix" },
                { value: "wordpress", label: "WordPress Open Stack Core" },
                { value: "plain_html", label: "Plain Structural Static HTML CDN" },
              ]}
            />

            <InputField
              label="Target System Publishing Domain"
              value={form.publishDomain}
              onChange={(v) => set("publishDomain", v)}
              placeholder="yoursite.com"
              helpText="Used to map down the secure confirmation routing URL keys."
            />
          </div>
        )}

        {/* Step: API Credentials */}
        {step === "credentials" && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <div className="md:col-span-2 text-xs">
              <p className="font-mono text-zinc-500 uppercase tracking-wide">Security Protocols Enabled</p>
              <p className="text-zinc-500 font-light mt-0.5">Authorization tokens undergo local AES-256-GCM symmetric block cipher encryption prior to database trace persistence. Keys remain cryptographically unexposed.</p>
            </div>
            <InputField
              label={`${form.bookingPlatform.replace(/_/g, " ").toUpperCase()} Authorization token`}
              value={form.bookingApiKey}
              onChange={(v) => set("bookingApiKey", v)}
              type="password"
              placeholder="Paste integration key..."
              required
            />
            <InputField
              label={`${form.emailPlatform.replace(/_/g, " ").toUpperCase()} Core API Secret Key`}
              value={form.emailApiKey}
              onChange={(v) => set("emailApiKey", v)}
              type="password"
              placeholder="Paste communication key..."
              required
            />
          </div>
        )}

        {/* Step: Brand Voice Copy Corpus */}
        {step === "voice" && (
          <div className="space-y-6 w-full">
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                Brand Marketing Corpus (500 Words Minimum)
              </label>
              <textarea
                value={form.rawVoiceCorpus}
                onChange={(e) => set("rawVoiceCorpus", e.target.value)}
                placeholder="Paste active sales parameters, text assets, scripts, sequence copy blocks, or transcription transcripts..."
                rows={8}
                className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-700 resize-y"
              />
              <p className="text-[10px] font-mono text-zinc-600 tracking-wide">
                Parsed Metrics: {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words mapped.
                {form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length < 500
                  ? " [ STANDBY — Minimum 500 words required for precise voice signature extraction ]"
                  : " [ NOMINAL ]"}
              </p>
            </div>

            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              <div className="space-y-1.5 w-full">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                  Top Roster Call Questions (One parameter entry per line)
                </label>
                <textarea
                  value={form.topCallQuestions}
                  onChange={(e) => set("topCallQuestions", e.target.value)}
                  placeholder={"What is the structural onboarding timeline?\nWhat conversion tracking metrics are generated?"}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-700 resize-y"
                />
              </div>

              <div className="space-y-1.5 w-full">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                  Top System Objections (One parameter entry per line)
                </label>
                <textarea
                  value={form.topObjections}
                  onChange={(e) => set("topObjections", e.target.value)}
                  placeholder={"The pricing scale exceeds our current allocation budget.\nThe structural sequence execution timing is misaligned."}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-800 focus:outline-none focus:border-zinc-700 resize-y"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step: Final Review Review */}
        {step === "confirm" && (
          <div className="space-y-3 w-full">
            <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">[ Deployment Matrix Review ]</h2>
            <div className="text-xs font-sans space-y-2 border border-zinc-900 bg-zinc-950/20 rounded-lg p-4">
              {[
                ["Target Mapped Account", form.buyerName],
                ["Offer Title Parameter", form.offerName],
                ["Financial Pricing Scale", form.offerPrice || "—"],
                ["Booking Engine Target", form.bookingPlatform.toUpperCase()],
                ["Communication CRM Node", form.emailPlatform.toUpperCase()],
                ["Closer Matrix Destination", form.briefDestination.toUpperCase()],
                ["Extracted Copy Metrics", `${form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length} words`],
                ["Configured Call Questions", `${form.topCallQuestions.split("\n").filter(Boolean).length} items`],
                ["Configured Funnel Objections", `${form.topObjections.split("\n").filter(Boolean).length} items`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-zinc-900/40 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-300 font-mono text-[11px]">{value}</span>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-xs font-mono text-rose-400 mt-2">
                [ CORE_PIPELINE_ERROR // {error} ]
              </p>
            )}
          </div>
        )}
      </div>

      {/* Execution Navigation Controls */}
      <div className="flex justify-between pt-4 border-t border-zinc-900">
        <button
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === step);
            if (idx > 0) setStep(STEPS[idx - 1].id);
          }}
          disabled={step === "offer"}
          className="px-4 py-1.5 text-xs font-mono font-normal border border-zinc-900 text-zinc-500 rounded hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-20 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer"
        >
          [ Back ]
        </button>

        {step !== "confirm" ? (
          <button
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
            }}
            className="px-4 py-1.5 text-xs font-mono font-normal border border-zinc-800 text-zinc-300 rounded hover:border-zinc-600 hover:text-zinc-100 transition-colors uppercase tracking-wider bg-zinc-900/10 cursor-pointer"
          >
            [ Next ]
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !form.buyerName || !form.bookingApiKey}
            className="px-4 py-1.5 text-xs font-mono font-normal border border-zinc-700 text-zinc-300 rounded hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors uppercase tracking-wider bg-zinc-900/20 cursor-pointer"
          >
            {submitting ? "[ RUNNING INITIAL_PROVISIONING... ]" : "[ LAUNCH CONFIG_NODE ]"}
          </button>
        )}
      </div>
    </div>
  );
}