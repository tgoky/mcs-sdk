"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InputField, SelectField } from "../../../new/form-fields";

/**
 * Win-Back's hinges panel. Unlike Pin-Down's, this doesn't gate enabling
 * Win-Back — every field defaults to a sane, usable value, so it's
 * reachable anytime from the engagement detail page as a plain
 * review/edit screen, not a required stop before turning Win-Back on.
 */
export default function WinBackBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("");
  const [emailPlatform, setEmailPlatform] = useState("");

  const [rescheduleMode, setRescheduleMode] = useState<"fresh_link" | "time_slots">("time_slots");
  const [recoveredFromNoShowTaggingEnabled, setRecoveredFromNoShowTaggingEnabled] = useState(true);
  const [inboundReplyMode, setInboundReplyMode] = useState<"native" | "forwarding" | "none">("none");
  const [hubspotPortalId, setHubspotPortalId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${id}/bridges/win-back`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setEmailPlatform(data.emailPlatform ?? "");
        setRescheduleMode(data.rescheduleMode ?? "time_slots");
        setRecoveredFromNoShowTaggingEnabled(data.recoveredFromNoShowTaggingEnabled ?? true);
        setInboundReplyMode(data.inboundReplyMode ?? "none");
        setHubspotPortalId(data.hubspotPortalId ?? "");
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

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${id}/bridges/win-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rescheduleMode,
          recoveredFromNoShowTaggingEnabled,
          inboundReplyMode,
          hubspotPortalId,
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
          Configure Win-Back{buyer ? ` for ${buyer}` : ""}
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          These already have sane defaults — Win-Back runs fine without ever opening this screen. Come back here
          anytime to change how it reschedules or detects replies.
        </p>
      </div>

      <SelectField
        label="Reschedule link mode"
        value={rescheduleMode}
        onChange={(v) => setRescheduleMode(v as "fresh_link" | "time_slots")}
        options={[
          { value: "time_slots", label: "Live available slots (default)" },
          { value: "fresh_link", label: "Per-prospect single-use link (Calendly/Cal.com only)" },
        ]}
        helpText="fresh_link uses the platform's own per-booking reschedule link when available (Calendly, Cal.com), falling back to live slots per prospect when it isn't (GHL, OnceHub)."
      />

      <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
        <input
          type="checkbox"
          checked={recoveredFromNoShowTaggingEnabled}
          onChange={(e) => setRecoveredFromNoShowTaggingEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Tag prospects as &quot;recovered from no-show&quot; on {emailPlatform || "the ESP"} when they rebook during
          an active recovery window.
        </span>
      </label>

      <SelectField
        label="Reply detection (exits the recovery cadence)"
        value={inboundReplyMode}
        onChange={(v) => setInboundReplyMode(v as "native" | "forwarding" | "none")}
        options={[
          { value: "none", label: "Off — cadence only stops on rebook or window elapse" },
          { value: "forwarding", label: "Forwarding — client forwards replies through an inbound-parse bridge" },
          { value: "native", label: "Native — HubSpot Conversations only" },
        ]}
        helpText={
          inboundReplyMode === "native" && emailPlatform !== "hubspot"
            ? "Native mode only works with HubSpot — Klaviyo and ActiveCampaign don't expose a stable reply webhook, use forwarding instead."
            : "A reply of any kind halts the win-back cadence for that prospect — table stakes for anything calling itself win-back."
        }
      />
      {inboundReplyMode === "native" && emailPlatform === "hubspot" && (
        <InputField
          label="HubSpot Portal ID"
          value={hubspotPortalId}
          onChange={setHubspotPortalId}
          helpText="Settings → Account Setup → Account Defaults in your client's HubSpot account."
          required
        />
      )}
      {inboundReplyMode === "forwarding" && (
        <div
          className="rounded-lg p-3 text-xs shadow-xs font-mono font-medium"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          A unique catcher URL generates once this is saved — point your client&apos;s Postmark/SendGrid inbound-parse
          bridge (or a forwarding rule through one) at it.
        </div>
      )}

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
          disabled={saving || (inboundReplyMode === "native" && emailPlatform === "hubspot" && !hubspotPortalId.trim())}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}