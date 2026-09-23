"use client";

// Extracted from this directory's page.tsx — see leak-map-config-form.tsx's
// header for why (inline Configure on WorkersPanel/Library vs. this same
// form as its own standalone, bookmarkable route).

import { useEffect, useState } from "react";
import { InputField, SelectField } from "@/app/dashboard/engagements/new/form-fields";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { PreCallReadLivePreview } from "./pre-call-read-live-preview";
import { FactSuggestionChip, type FactSuggestionDTO } from "@/components/fact-suggestion";

export function PreCallReadConfigForm({
  engagementId,
  onCancel,
  cancelLabel = "Back to engagement",
}: {
  engagementId: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [briefTriggerType, setBriefTriggerType] = useState<"nightly" | "dynamic_webhook">("nightly");
  const [videoEngagementPlatform, setVideoEngagementPlatform] = useState("none");
  const [heroVideoId, setHeroVideoId] = useState("");
  const [videoEngagementWistiaVideoId, setVideoEngagementWistiaVideoId] = useState("");
  const [videoEngagementYoutubeChannelId, setVideoEngagementYoutubeChannelId] = useState("");
  const [prospectResearchSourcesUsed, setProspectResearchSourcesUsed] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, FactSuggestionDTO>>({});
  const [briefLandingDestination, setBriefLandingDestination] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  // Two ways to reach Slack: sign in (Composio) and pick a channel, or paste
  // an incoming-webhook URL. See src/lib/slack-delivery.ts.
  const [slackMode, setSlackMode] = useState<"signin" | "webhook">("signin");
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [slackChannelId, setSlackChannelId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/pre-call-read`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setBriefTriggerType(data.briefTriggerType ?? "nightly");
        setVideoEngagementPlatform(data.videoEngagementPlatform ?? "none");
        setHeroVideoId(data.heroVideoId ?? "");
        setVideoEngagementWistiaVideoId(data.videoEngagementWistiaVideoId ?? "");
        setVideoEngagementYoutubeChannelId(data.videoEngagementYoutubeChannelId ?? "");
        setProspectResearchSourcesUsed(data.prospectResearchSourcesUsed ?? []);
        setSuggestions(data.suggestions ?? {});
        setBriefLandingDestination(data.briefLandingDestination ?? "");
        setSlackWebhookUrl(data.slackWebhookUrl ?? "");
        setSlackConnected(Boolean(data.slackConnected));
        setSlackChannels(data.slackChannels ?? []);
        setSlackChannelId(data.slackChannelId ?? "");
        // A client already on a webhook (and not signed in) stays on it.
        setSlackMode(data.slackWebhookUrl && !data.slackChannelId ? "webhook" : "signin");
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  // After Slack is connected in place, pick up the channel list the harvest
  // just wrote. The harvest runs in the background, so it can lag a moment.
  async function refreshSlack() {
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/pre-call-read`);
      if (!res.ok) return;
      const data = await res.json();
      setSlackConnected(Boolean(data.slackConnected));
      setSlackChannels(data.slackChannels ?? []);
    } catch {
      // Leave what's shown; the user can reload.
    }
  }

  function toggleSource(source: "apollo" | "pdl", checked: boolean) {
    setProspectResearchSourcesUsed((prev) => (checked ? [...prev, source] : prev.filter((s) => s !== source)));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/pre-call-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefTriggerType,
          videoEngagementPlatform,
          heroVideoId,
          videoEngagementWistiaVideoId,
          videoEngagementYoutubeChannelId,
          prospectResearchSourcesUsed,
          briefLandingDestination: briefLandingDestination || undefined,
          // Only the chosen Slack setup is sent; the other is cleared so
          // briefs don't keep going to a setup the user moved away from.
          ...(briefLandingDestination === "slack"
            ? slackMode === "signin"
              ? { slackChannelId, slackWebhookUrl: "" }
              : { slackWebhookUrl, slackChannelId: "" }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save. Nothing else was affected.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setSaveError(message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message);
      setSaving(false);
    }
  }

  if (loading) {
    return <ConfigFormSkeleton />;
  }
  if (loadError) {
    return (
      <div className="p-6 text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
        ⚠ {loadError}
      </div>
    );
  }

  const steps: ProgressiveFlowStep[] = [
    {
      id: "brief-destination",
      label: "Where briefs land",
      isComplete:
        briefLandingDestination === "crm_note" ||
        (briefLandingDestination === "slack" &&
          (slackMode === "webhook" ? slackWebhookUrl.trim().length > 0 : slackConnected && Boolean(slackChannelId))),
      content: (
        <div className="space-y-3">
          <ChoiceCardGroup
            label="Where finished briefs are delivered"
            value={briefLandingDestination}
            onChange={setBriefLandingDestination}
            options={[
              { value: "slack", label: "Slack channel" },
              { value: "crm_note", label: "CRM note (HubSpot, Klaviyo or GoHighLevel)" },
            ]}
            helpText="A CRM note lands on the prospect's contact record, with no Slack setup."
          />
          <FactSuggestionChip
            engagementId={engagementId}
            factKey="briefLandingDestination"
            suggestion={briefLandingDestination ? undefined : suggestions.briefLandingDestination}
            currentValue={briefLandingDestination}
            display={(v) => (v === "crm_note" ? "CRM note" : String(v))}
            onUse={(v) => setBriefLandingDestination(String(v))}
          />
          {briefLandingDestination === "slack" && (
            <>
              <ChoiceCardGroup
                label="How to reach Slack"
                value={slackMode}
                onChange={(v) => setSlackMode(v as "signin" | "webhook")}
                options={[
                  { value: "signin", label: "Sign in with Slack and pick a channel" },
                  { value: "webhook", label: "Paste an incoming-webhook URL" },
                ]}
                helpText="Signed-in posts are text only (no Approve/Reject buttons); webhook posts keep the buttons."
              />
              {slackMode === "signin" ? (
                <>
                  <CredentialRow engagementId={engagementId} provider="slack" label="Slack" onSaved={refreshSlack} />
                  {slackConnected && slackChannels.length > 0 && (
                    <SelectField
                      label="Channel"
                      value={slackChannelId}
                      onChange={setSlackChannelId}
                      options={[{ value: "", label: "Pick a channel" }, ...slackChannels.map((c) => ({ value: c.id, label: c.name }))]}
                      helpText="Public channels in the connected workspace. Invite the Slack app to the channel so it can post there."
                    />
                  )}
                  {slackConnected && slackChannels.length === 0 && (
                    <div className="text-[11px] text-zinc-400">
                      Slack is connected but no channels have been read yet.{" "}
                      <button type="button" onClick={refreshSlack} className="font-semibold text-amber-400 hover:underline cursor-pointer">
                        Check again
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <InputField
                  label="Slack webhook URL"
                  value={slackWebhookUrl}
                  onChange={setSlackWebhookUrl}
                  placeholder="https://hooks.slack.com/services/..."
                  required
                />
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: "brief-schedule",
      label: "Brief schedule",
      isComplete: true,
      content: (
        <SelectField
          label="Pre-Call Brief Schedule"
          value={briefTriggerType}
          onChange={(v) => setBriefTriggerType(v as "nightly" | "dynamic_webhook")}
          options={[
            { value: "nightly", label: "Nightly Batch — Group and brief tomorrow's roster at 20:00 UTC" },
            { value: "dynamic_webhook", label: "Dynamic Poll — Brief individually within 15 minutes of entering the lead window" },
          ]}
          helpText="Choose 'Dynamic' if your sales reps require briefs generated on-demand as soon as an upcoming call crosses into its imminent lead-time window."
        />
      ),
    },
    {
      id: "video-engagement",
      label: "Video engagement",
      isComplete: videoEngagementPlatform !== "none",
      content: (
        <div className="space-y-3">
          <ChoiceCardGroup
            label="Confirmation-page video platform"
            value={videoEngagementPlatform}
            onChange={setVideoEngagementPlatform}
            options={[
              { value: "none", label: "None" },
              { value: "vidalytics", label: "Vidalytics" },
              { value: "wistia", label: "Wistia" },
              { value: "youtube_analytics", label: "YouTube" },
              { value: "loom", label: "Loom" },
            ]}
            helpText="Vidalytics/Wistia give per-prospect watch data if your video embed passes their email. YouTube can only report aggregate stats, and Loom has no analytics API at all."
          />
          <FactSuggestionChip
            engagementId={engagementId}
            factKey="videoEngagementPlatform"
            suggestion={videoEngagementPlatform === "none" ? suggestions.videoEngagementPlatform : undefined}
            currentValue={videoEngagementPlatform}
            display={(v) => ({ youtube_analytics: "YouTube", wistia: "Wistia", vidalytics: "Vidalytics", loom: "Loom" })[String(v)] ?? String(v)}
            onUse={(v) => setVideoEngagementPlatform(String(v))}
          />
          {(videoEngagementPlatform === "vidalytics" || videoEngagementPlatform === "wistia" || videoEngagementPlatform === "youtube_analytics") && (
            <CredentialRow
              engagementId={engagementId}
              provider={videoEngagementPlatform}
              label={`${videoEngagementPlatform === "youtube_analytics" ? "Google" : videoEngagementPlatform === "vidalytics" ? "Vidalytics" : "Wistia"} key`}
            />
          )}
          {videoEngagementPlatform === "vidalytics" && (
            <InputField label="Confirmation-page video ID" value={heroVideoId} onChange={setHeroVideoId} />
          )}
          {videoEngagementPlatform === "wistia" && (
            <InputField label="Wistia video ID" value={videoEngagementWistiaVideoId} onChange={setVideoEngagementWistiaVideoId} />
          )}
          {videoEngagementPlatform === "youtube_analytics" && (
            <>
              <InputField label="YouTube channel ID" value={videoEngagementYoutubeChannelId} onChange={setVideoEngagementYoutubeChannelId} />
              <InputField label="Confirmation-page video ID" value={heroVideoId} onChange={setHeroVideoId} />
            </>
          )}
        </div>
      ),
    },
    {
      id: "prospect-research",
      label: "Prospect research",
      isComplete: prospectResearchSourcesUsed.length > 0,
      content: (
        <div className="space-y-3">
          <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
            If the client already has their own Apollo or PDL subscription, it layers on top of standard web
            research — never a required cost.
          </p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={prospectResearchSourcesUsed.includes("apollo")}
                onChange={(e) => toggleSource("apollo", e.target.checked)}
              />
              Apollo
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={prospectResearchSourcesUsed.includes("pdl")}
                onChange={(e) => toggleSource("pdl", e.target.checked)}
              />
              People Data Labs
            </label>
          </div>
          {prospectResearchSourcesUsed.includes("apollo") && (
            <CredentialRow engagementId={engagementId} provider="apollo" label="Apollo key" />
          )}
          {prospectResearchSourcesUsed.includes("pdl") && (
            <CredentialRow engagementId={engagementId} provider="pdl" label="PDL key" />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto px-4 py-6" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Configure Pre-Call Read{buyer ? ` for ${buyer}` : ""}
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          These already have sane defaults — Pre-Call Read runs fine without ever opening this screen. Come back
          anytime to change the brief schedule or add video tracking / research sources.
        </p>
      </div>

      <PreCallReadLivePreview
        briefTriggerType={briefTriggerType}
        videoEngagementPlatform={videoEngagementPlatform}
        prospectResearchSourcesUsed={prospectResearchSourcesUsed}
      />

      <WorkerCapabilityMatrix workerId="pre-call-read" engagementId={engagementId} />

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save" finishing={saving} />

      {saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ Error: {saveError}
        </p>
      )}
      {saved && !saveError && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--text-muted)" }}>
          ✓ Saved.
        </p>
      )}

      <div className="pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
