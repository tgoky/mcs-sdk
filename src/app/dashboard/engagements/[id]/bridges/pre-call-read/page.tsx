"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, SelectField } from "../../../new/form-fields";

export default function PreCallReadBridgePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");

  const [briefTriggerType, setBriefTriggerType] = useState<"nightly" | "dynamic_webhook">("nightly");
  const [videoEngagementPlatform, setVideoEngagementPlatform] = useState("none");
  const [videoEngagementApiKey, setVideoEngagementApiKey] = useState("");
  const [heroVideoId, setHeroVideoId] = useState("");
  const [videoEngagementWistiaVideoId, setVideoEngagementWistiaVideoId] = useState("");
  const [videoEngagementYoutubeChannelId, setVideoEngagementYoutubeChannelId] = useState("");
  const [prospectResearchSourcesUsed, setProspectResearchSourcesUsed] = useState<string[]>([]);
  const [apolloApiKey, setApolloApiKey] = useState("");
  const [pdlApiKey, setPdlApiKey] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/bridges/pre-call-read`);
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
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleSource(source: "apollo" | "pdl", checked: boolean) {
    setProspectResearchSourcesUsed((prev) => (checked ? [...prev, source] : prev.filter((s) => s !== source)));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${id}/bridges/pre-call-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefTriggerType,
          videoEngagementPlatform,
          videoEngagementApiKey,
          heroVideoId,
          videoEngagementWistiaVideoId,
          videoEngagementYoutubeChannelId,
          prospectResearchSourcesUsed,
          apolloApiKey,
          pdlApiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save. Nothing else was affected.");
        setSaving(false);
        return;
      }
      // Credential fields never round-trip back from GET — clear them
      // locally after a successful save so the password inputs don't
      // imply a stale value is still pending.
      setVideoEngagementApiKey("");
      setApolloApiKey("");
      setPdlApiKey("");
      setSaving(false);
      setSaved(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setSaveError(message === "Failed to fetch" ? "Couldn't reach the server. Check your connection and try again." : message);
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-xs font-mono" style={{ color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (loadError) {
    return (
      <div className="p-6 text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
        ⚠ {loadError}
      </div>
    );
  }

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

      <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
          Video Engagement (optional)
        </label>
        <SelectField
          label="Confirmation-page video platform"
          value={videoEngagementPlatform}
          onChange={setVideoEngagementPlatform}
          options={[
            { value: "none", label: "No video engagement tracking" },
            { value: "vidalytics", label: "Vidalytics" },
            { value: "wistia", label: "Wistia" },
            { value: "youtube_analytics", label: "YouTube (aggregate stats only)" },
            { value: "loom", label: "Loom (no analytics API available)" },
          ]}
          helpText="Vidalytics/Wistia give per-prospect watch data if your video embed passes their email. YouTube can only report aggregate stats, and Loom has no analytics API at all."
        />
        {(videoEngagementPlatform === "vidalytics" || videoEngagementPlatform === "wistia" || videoEngagementPlatform === "youtube_analytics") && (
          <InputField
            label={`${videoEngagementPlatform === "youtube_analytics" ? "Google" : videoEngagementPlatform === "vidalytics" ? "Vidalytics" : "Wistia"} API Key`}
            value={videoEngagementApiKey}
            onChange={setVideoEngagementApiKey}
            type="password"
            helpText="Leave blank to keep whatever's already saved."
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

      <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
          Prospect Research BYOK (optional)
        </label>
        <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
          If the client already has their own Apollo or PDL subscription, it layers on top of standard web research
          — never a required cost.
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
          <InputField label="Apollo API Key" value={apolloApiKey} onChange={setApolloApiKey} type="password" helpText="Leave blank to keep whatever's already saved." />
        )}
        {prospectResearchSourcesUsed.includes("pdl") && (
          <InputField label="PDL API Key" value={pdlApiKey} onChange={setPdlApiKey} type="password" helpText="Leave blank to keep whatever's already saved." />
        )}
      </div>

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

      <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => router.push(`/dashboard/engagements/${id}`)}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          Back to engagement
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
