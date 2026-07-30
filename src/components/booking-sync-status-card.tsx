"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
} from "lucide-react";
import { platformSupportsAutoWebhook, type BookingSyncStatus } from "@/lib/booking-sync-status";
import { bookingPlatformLabel } from "@/lib/copy";

const HEALTH_STYLES: Record<
  BookingSyncStatus["health"],
  { dot: string; text: string; bg: string; border: string; Icon: typeof CheckCircle2 }
> = {
  healthy: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-900/40",
    Icon: CheckCircle2,
  },
  warning: {
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/20",
    border: "border-sky-200 dark:border-sky-900/40",
    Icon: AlertTriangle,
  },
  error: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/20",
    border: "border-rose-200 dark:border-rose-900/40",
    Icon: AlertCircle,
  },
  unconfigured: {
    dot: "bg-zinc-400 dark:bg-zinc-600",
    text: "text-zinc-500 dark:text-zinc-400",
    bg: "bg-zinc-50 dark:bg-zinc-900/30",
    border: "border-zinc-200 dark:border-zinc-800",
    Icon: AlertCircle,
  },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{label}</p>
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function CopyField({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!mask);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard fallback
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 min-w-0 truncate text-xs font-mono px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
          {revealed ? value : "•".repeat(Math.min(value.length, 40))}
        </code>
        {mask && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="shrink-0 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          title="Copy"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

const SETUP_STEPS: Record<string, string[]> = {
  ghl_calendar: [
    "In GoHighLevel, go to Automation -> Workflows and open (or create) the workflow that fires on Appointment Status Changed.",
    'Add a "Custom Webhook" action, set the method to POST, and paste the Webhook URL below into the URL field.',
    "Add a custom header named X-Webhook-Signature and paste the Signing Secret below as its value.",
    "Save and publish the workflow, then click \"I've added it\" below.",
  ],
  oncehub: [
    "In OnceHub, go to account-level Webhooks setup (Admin -> Integrations -> Webhooks) and add a new webhook.",
    "Paste the Webhook URL below as the destination and select booking-created and booking-cancelled triggers.",
    "Paste OnceHub's generated signing secret into the Signing Secret field below.",
    "Click \"I've added it\" below once saved.",
  ],
};

interface Props {
  engagementId: string;
  status: BookingSyncStatus;
}

export function BookingSyncStatusCard({ engagementId, status: initial }: Props) {
  const [status, setStatus] = useState(initial);
  const [secretInput, setSecretInput] = useState(initial.hasSigningSecret ? "" : "");
  const [busy, setBusy] = useState<"webhook" | "polling" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.platform) return null;

  const styles = HEALTH_STYLES[status.health];
  const Icon = styles.Icon;
  const setupSteps = SETUP_STEPS[status.platform] ?? [];
  const platformLabel = bookingPlatformLabel(status.platform);
  
  // Gate manual sync options exclusively for manual-setup platforms (GHL Calendar, OnceHub)
  const supportsAutoWebhook = platformSupportsAutoWebhook(status.platform);

  async function patch(payload: Record<string, unknown>, kind: "webhook" | "polling" | "dismiss") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/sync-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setStatus((s) => ({
        ...s,
        mode: data.mode ?? s.mode,
        webhookUrl: data.webhookUrl ?? s.webhookUrl,
        hasSigningSecret: Boolean(data.signingSecret),
        dismissed: Boolean(data.dismissed),
        actionNeeded: data.mode === "webhook" ? false : s.actionNeeded && !data.dismissed,
        health: data.mode === "webhook" ? "warning" : s.health,
        headline: data.mode === "webhook" ? "Direct webhook · awaiting first delivery" : s.headline,
      }));
      if (data.signingSecret) setSecretInput(data.signingSecret);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-900">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{status.headline}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate">{status.detail}</p>
          </div>
        </div>
        <Icon size={16} className={`${styles.text} shrink-0 ml-2`} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
        <StatTile label="Platform" value={platformLabel} />
        <StatTile
          label="Mode"
          value={status.mode === "webhook" ? "Direct webhook" : status.mode === "polling" ? `Polling · ${status.pollIntervalMinutes ?? 5}m` : "Not set"}
        />
        <StatTile
          label={status.lastActivityKind === "webhook" ? "Last delivery" : status.lastActivityKind === "poll" ? "Last checked" : "Last activity"}
          value={relativeTime(status.lastActivityAt)}
        />
        <StatTile
          label={status.mode === "polling" ? "Next check" : "Health"}
          value={status.mode === "polling" ? relativeTime(status.nextPollDueAt).replace("ago", "") || "Due now" : status.health === "healthy" ? "Healthy" : status.health === "warning" ? "Attention" : status.health === "error" ? "Error" : "Unconfigured"}
        />
      </div>

      {/* Manual Setup Nudge & Controls (Rendered ONLY if !supportsAutoWebhook) */}
      {!supportsAutoWebhook && (
        <>
          {status.actionNeeded && (
            <div className="mx-4 mb-4 rounded-lg border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Zap size={15} className="text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                    Action needed · add your webhook to {platformLabel}
                  </p>
                  <p className="text-xs text-sky-700/80 dark:text-sky-400/80 mt-0.5">
                    {platformLabel} requires manual endpoint configuration. Auto-polling checks every{" "}
                    {status.pollIntervalMinutes ?? 5} minutes in the meantime.
                  </p>
                </div>
              </div>

              <CopyField label="Webhook Receiver URL" value={status.webhookUrl} />
              <CopyField
                label="Signing Secret"
                value={secretInput || "(generated upon direct webhook activation)"}
                mask
              />

              {setupSteps.length > 0 && (
                <ol className="space-y-1.5 pl-4 list-decimal text-xs text-sky-800/90 dark:text-sky-300/90 leading-relaxed">
                  {setupSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}

              {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => patch({ mode: "webhook" }, "webhook")}
                  className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-gold text-gold-foreground hover:bg-gold-hover disabled:opacity-50 transition-colors"
                >
                  {busy === "webhook" ? "Switching..." : "I've added it · switch to Direct Webhook"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => patch({ dismissSetupNudge: true }, "dismiss")}
                  className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
                >
                  {busy === "dismiss" ? "Saving..." : "Keep auto-polling for now"}
                </button>
              </div>
            </div>
          )}

          {/* Reversible mode toggle for manual platforms */}
          {status.mode === "webhook" && (
            <div className="mx-4 mb-4 flex items-center justify-between">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
                Prefer auto-polling instead? You can switch back any time.
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => patch({ mode: "polling" }, "polling")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded-lg border border-zinc-300 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={11} className={busy === "polling" ? "animate-spin" : ""} />
                {busy === "polling" ? "Switching..." : "Switch to auto-polling"}
              </button>
            </div>
          )}
        </>
      )}

      {status.lastError && !status.actionNeeded && (
        <div className="mx-4 mb-4 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
          <Clock size={13} className="mt-0.5 shrink-0" />
          <span>{status.lastError}</span>
        </div>
      )}
    </div>
  );
}