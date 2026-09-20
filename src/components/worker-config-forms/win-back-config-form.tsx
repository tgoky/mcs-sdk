"use client";

// Extracted from this directory's page.tsx — see leak-map-config-form.tsx's
// header for why (inline Configure on WorkersPanel/Library vs. this same
// form as its own standalone, bookmarkable route).

import { useCallback, useEffect, useState } from "react";
import { InputField } from "@/app/dashboard/engagements/new/form-fields";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { ChoiceCardGroup } from "@/components/choice-card-group";
import { ProgressiveFlow, type ProgressiveFlowStep } from "@/components/progressive-flow";
import { BehaviorSummary } from "./behavior-summary";

// Phase 6 — the webhook URL each platform's bounce/complaint events get
// registered against, engagement-scoped (see each route's own module
// comment in src/app/api/webhooks/*-delivery/[engagementId]/route.ts).
// HubSpot and SMTP deliberately have no entry here: HubSpot is polled,
// not webhooked (esp-delivery-poll.ts), and SMTP's bounce detection
// reuses the existing reply-forwarding catcher URL shown below, not a
// second URL.
const DELIVERY_WEBHOOK_PATH: Record<string, string> = {
  klaviyo: "klaviyo-delivery",
  activecampaign: "activecampaign-delivery",
  mailchimp: "mailchimp-delivery",
  convertkit: "convertkit-delivery",
};
const DELIVERY_WEBHOOK_SECRET_PROVIDER: Record<string, string> = {
  klaviyo: "klaviyo_webhook_secret",
  activecampaign: "activecampaign_webhook_secret",
  mailchimp: "mailchimp_webhook_secret",
};

export function WinBackConfigForm({
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
  const [emailPlatform, setEmailPlatform] = useState("");

  const [rescheduleMode, setRescheduleMode] = useState<"fresh_link" | "time_slots">("time_slots");
  const [recoveredFromNoShowTaggingEnabled, setRecoveredFromNoShowTaggingEnabled] = useState(true);
  const [inboundReplyMode, setInboundReplyMode] = useState<"native" | "forwarding" | "none">("none");
  const [hubspotPortalId, setHubspotPortalId] = useState("");
  // Auto-derived from HubSpot's own account-info API (see the
  // hubspot-portal route) instead of asking the operator to hand-copy it
  // from HubSpot's Account Setup screen. detected=true means the value in
  // hubspotPortalId came from that lookup; editingPortalId lets them
  // override it if the auto-detected value is ever wrong.
  const [fetchingPortalId, setFetchingPortalId] = useState(false);
  const [portalIdError, setPortalIdError] = useState<string | null>(null);
  const [portalIdDetected, setPortalIdDetected] = useState(false);
  const [editingPortalId, setEditingPortalId] = useState(false);

  // Phase 6 — bounce/complaint-rate auto-pause (esp-delivery-monitor.ts).
  const [autoPaused, setAutoPaused] = useState(false);
  const [autoPausedAt, setAutoPausedAt] = useState<string | null>(null);
  const [autoPausedReason, setAutoPausedReason] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [activecampaignWebhookSignatureHeader, setActivecampaignWebhookSignatureHeader] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/win-back`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setEmailPlatform(data.emailPlatform ?? "");
        setRescheduleMode(data.rescheduleMode ?? "time_slots");
        setRecoveredFromNoShowTaggingEnabled(data.recoveredFromNoShowTaggingEnabled ?? true);
        setInboundReplyMode(data.inboundReplyMode ?? "none");
        setHubspotPortalId(data.hubspotPortalId ?? "");
        setAutoPaused(Boolean(data.autoPaused));
        setAutoPausedAt(data.autoPausedAt ?? null);
        setAutoPausedReason(data.autoPausedReason ?? null);
        setActivecampaignWebhookSignatureHeader(data.activecampaignWebhookSignatureHeader ?? "");
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

  const fetchPortalId = useCallback(() => {
    let cancelled = false;
    setFetchingPortalId(true);
    setPortalIdError(null);
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/win-back/hubspot-portal`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to detect the Portal ID");
        setHubspotPortalId(data.portalId ?? "");
        setPortalIdDetected(true);
        setEditingPortalId(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setPortalIdDetected(false);
          setPortalIdError(e instanceof Error ? e.message : "Failed to detect the Portal ID");
        }
      } finally {
        if (!cancelled) setFetchingPortalId(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  // Auto-detect the Portal ID the moment we know this client is on
  // HubSpot, instead of leaving a blank/hand-typed field for something
  // HubSpot's own Account Info API already returns for the connected key.
  useEffect(() => {
    if (loading || emailPlatform !== "hubspot") return;
    return fetchPortalId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, emailPlatform]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/win-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rescheduleMode,
          recoveredFromNoShowTaggingEnabled,
          inboundReplyMode,
          hubspotPortalId,
          activecampaignWebhookSignatureHeader,
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

  async function resume() {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/win-back/resume-sends`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to resume.");
      setAutoPaused(false);
      setAutoPausedAt(null);
      setAutoPausedReason(null);
    } catch (e: unknown) {
      setResumeError(e instanceof Error ? e.message : "Failed to resume.");
    } finally {
      setResuming(false);
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
      id: "reschedule-replies",
      label: "Reschedule & replies",
      isComplete: !(inboundReplyMode === "native" && emailPlatform === "hubspot" && !hubspotPortalId.trim()),
      content: (
        <div className="space-y-4">
          <ChoiceCardGroup
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

          <ChoiceCardGroup
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
            <div className="space-y-1.5">
              {fetchingPortalId && (
                <p className="text-[11px] italic font-mono animate-pulse" style={{ color: "var(--text-muted)" }}>
                  ⚡ Contacting HubSpot… detecting this account&apos;s Portal ID…
                </p>
              )}
              {portalIdError && !fetchingPortalId && (
                <div className="rounded-sm p-3 text-[11px] font-mono border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 shadow-sm">
                  ⚠ Couldn&apos;t auto-detect: {portalIdError}
                </div>
              )}
              {portalIdDetected && !editingPortalId ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                    HubSpot Portal ID
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <span className="font-mono">{hubspotPortalId}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">✓ detected via HubSpot</span>
                    <button type="button" onClick={() => setEditingPortalId(true)} className="ml-auto text-[11px] font-semibold hover:underline cursor-pointer" style={{ color: "var(--text-muted)" }}>
                      Override
                    </button>
                  </div>
                </div>
              ) : (
                <InputField
                  label="HubSpot Portal ID"
                  value={hubspotPortalId}
                  onChange={setHubspotPortalId}
                  helpText={
                    portalIdDetected
                      ? "Overriding the auto-detected value — re-check the box above to go back to it."
                      : "Auto-detection needs the connected key's account-info.security.read scope. Settings → Account Setup → Account Defaults in your client's HubSpot account has the same number if you'd rather paste it."
                  }
                  required
                />
              )}
            </div>
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
        </div>
      ),
    },
    {
      id: "deliverability",
      label: "Deliverability monitoring",
      isComplete: true,
      content: DELIVERY_WEBHOOK_PATH[emailPlatform] ? (
        <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Bounce/complaint monitoring
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Register this URL as a webhook in your client&apos;s {emailPlatform} account to enable auto-pause.
              Optional — Win-Back runs fine without it, just without deliverability protection.
            </p>
          </div>
          <div
            className="rounded-lg p-2 text-[11px] font-mono break-all"
            style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
          >
            {`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${DELIVERY_WEBHOOK_PATH[emailPlatform]}/${engagementId}`}
          </div>
          {emailPlatform === "activecampaign" && (
            <InputField
              label="Signature header name"
              value={activecampaignWebhookSignatureHeader}
              onChange={setActivecampaignWebhookSignatureHeader}
              placeholder="X-My-Signature"
              helpText="The custom header name you chose when creating this webhook in ActiveCampaign's UI — whichever one you flagged is_signature."
            />
          )}
          {emailPlatform === "mailchimp" && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Mailchimp has no signature header — the secret goes directly in the URL. Pick your own secret value
              first, append <code>?secret=&lt;that value&gt;</code> to the URL above before pasting it into Mailchimp,
              then enter that same value below (it&apos;s never shown again after saving, so keep a copy).
            </p>
          )}
          {DELIVERY_WEBHOOK_SECRET_PROVIDER[emailPlatform] && (
            <CredentialRow
              engagementId={engagementId}
              provider={DELIVERY_WEBHOOK_SECRET_PROVIDER[emailPlatform]}
              label="Webhook secret"
            />
          )}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Not available for {emailPlatform || "this platform"} — see the note above if applicable.
        </p>
      ),
    },
  ];

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

      {autoPaused && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">
              Auto-paused{autoPausedAt ? ` — ${new Date(autoPausedAt).toLocaleString()}` : ""}
            </h2>
            <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
              {autoPausedReason ?? "A deliverability threshold was crossed."} Every active enrollment was unenrolled from{" "}
              {emailPlatform || "the ESP"}. No new prospects will be enrolled until you resume.
            </p>
          </div>
          {resumeError && <p className="text-[11px] font-mono font-semibold text-rose-700 dark:text-rose-400">⚠ {resumeError}</p>}
          <button
            type="button"
            onClick={resume}
            disabled={resuming}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-400 dark:border-rose-800 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-40 cursor-pointer"
          >
            {resuming ? "Resuming…" : "Resume Win-Back sends"}
          </button>
        </div>
      )}

      {emailPlatform === "ghl" && !autoPaused && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-[11px] text-amber-800 dark:text-amber-400">
            <span className="font-bold">Bounce/complaint auto-pause isn&apos;t available for GHL yet.</span> GHL&apos;s
            bounce/complaint data requires a Marketplace OAuth app this integration doesn&apos;t use today — not
            monitored, not silently assumed healthy.
          </p>
        </div>
      )}

      <WorkerCapabilityMatrix workerId="win-back" engagementId={engagementId} />

      <BehaviorSummary
        lines={[
          rescheduleMode === "fresh_link"
            ? "Prospects get a per-booking single-use reschedule link (falling back to live slots where the platform doesn't support it)."
            : "Prospects see live available slots to rebook, pulled fresh each time.",
          recoveredFromNoShowTaggingEnabled
            ? `Prospects who rebook during recovery get tagged on ${emailPlatform || "the ESP"}.`
            : "Rebooked prospects are not tagged on the ESP.",
          inboundReplyMode === "none"
            ? "A reply doesn't stop the cadence — only a rebook or the recovery window elapsing does."
            : inboundReplyMode === "native"
              ? "Any reply (via HubSpot Conversations) halts the recovery cadence for that prospect immediately."
              : "Any forwarded reply halts the recovery cadence for that prospect immediately.",
        ]}
      />

      <ProgressiveFlow steps={steps} onFinish={save} finishLabel="Save" finishDisabled={saving || (inboundReplyMode === "native" && emailPlatform === "hubspot" && !hubspotPortalId.trim())} finishing={saving} />

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

      <div className="flex justify-end pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
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
