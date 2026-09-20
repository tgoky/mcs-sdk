"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ShieldAlert, KeyRound, Zap } from "lucide-react";
import { useTour } from "@/components/tours/tour-provider";

interface ScopeProbeResult {
  ok: boolean;
  missingScope?: string;
  unnamedDenial?: boolean;
  checkedAt: string;
}

interface ConnectState {
  connected: boolean;
  credentialType?: string;
  whopAccountId?: string | null;
  scopeProbeResults?: Record<string, ScopeProbeResult>;
  pinnedVersionDate?: string | null;
  circuitBreakerState?: string;
  circuitBreakerReason?: string | null;
}

// Human-readable label + "what breaks if this is locked" per Section 2.4's
// own probe table — kept here rather than inferred from the probe's own
// label string so a future probe rename doesn't silently blank the UI.
const PROBE_LABELS: Record<string, { label: string; locksWhat: string }> = {
  accounts: { label: "Account access", locksWhat: "Everything — this key has no usable Whop account." },
  products: { label: "Products", locksWhat: "Catalog and product-launch skills" },
  plans: { label: "Plans", locksWhat: "Pricing skills" },
  memberships: { label: "Memberships", locksWhat: "Membership-driven skills" },
  stats: { label: "Stats engine", locksWhat: "All reporting (baseline requirement)" },
  webhooks: { label: "Webhooks", locksWhat: "Webhook fleet, bridge, and digest skills" },
  disputes: { label: "Disputes", locksWhat: "Dispute skills" },
  dispute_alerts: { label: "Dispute alerts", locksWhat: "Early-warning skills" },
  payments: { label: "Payments (elevated)", locksWhat: "Expected locked on a standard key" },
  affiliates: { label: "Affiliates", locksWhat: "Affiliate reporting" },
  chat_channels: { label: "Chat channels", locksWhat: "Community reads" },
  dm_channels: { label: "DM channels", locksWhat: "Nothing shipped depends on this today" },
  support_channels: { label: "Support channels", locksWhat: "Nothing shipped depends on this today" },
  app_users: { label: "Credential-type check", locksWhat: "Informational only" },
  memberships_v2: { label: "Attribution source (v2 API)", locksWhat: "Attribution & Affiliate Report" },
};

export function WhopConnectConfigForm({ engagementId, onSaved }: { engagementId: string; onSaved?: () => void }) {
  const { start: startTour } = useTour();
  const [state, setState] = useState<ConnectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/engagements/${engagementId}/bridges/whop-connect`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ connected: false }))
      .finally(() => setLoading(false));
  }, [engagementId]);

  async function submit() {
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/whop-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not connect this key.");
        if (body.probe) {
          setState((prev) => ({ ...(prev ?? { connected: false }), scopeProbeResults: body.probe.results }));
        }
        return;
      }
      setApiKey("");
      setState({
        connected: true,
        credentialType: body.credentialType,
        whopAccountId: body.probe?.whopAccountId,
        scopeProbeResults: body.probe?.results,
        pinnedVersionDate: body.pinnedVersionDate,
        circuitBreakerState: "closed",
      });
      // Whop Agent's own onboarding just finished — auto-launch its tour
      // (no-op if this engagement isn't the workspace's primary one,
      // same guard every other tour entry point relies on).
      startTour("whop-agent");
      onSaved?.();
    } catch {
      setError("Network error while connecting to Whop.");
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    setSubmitting(true);
    try {
      await fetch(`/api/engagements/${engagementId}/bridges/whop-connect`, { method: "DELETE" });
      setState({ connected: false });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading connection state…</div>;
  }

  return (
    <div className="space-y-5">
      {state?.circuitBreakerState === "open" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Connection paused — credential error.</p>
            <p className="mt-0.5">{state.circuitBreakerReason ?? "Reconnect with a valid key to resume scheduled Whop Agent skills."}</p>
          </div>
        </div>
      )}

      {/* Vault slot — same secure-input visual language as CredentialRow's
          paste-a-key mode elsewhere in the app: a bordered card framing
          the secret input, not a bare label+input pair. This worker's
          field IS the credential (whop-connect has no other configFields),
          so this single slot is the whole Dossier for it. */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            {state?.connected ? "Reconnect with a new key" : "Whop API key"}
          </label>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Generate one under Whop Dashboard → Developer → API keys. This runs a 15-call probe against your account —
          nothing is written to Whop.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="apik_..."
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !apiKey.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors whitespace-nowrap"
          >
            {submitting ? "Connecting…" : state?.connected ? "Reconnect" : "Connect"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {/* State-shift moment (Phase 3's "Live Operational Feedback" —
          completing setup should visibly transition the worker from
          Unconfigured to Armed, not just show a quiet toast). This is
          whop-connect's own onboarding-worker equivalent of the "Armed
          Worker" transition pin-down/pre-call-read/icp-lock already get
          from arming their own Dossier. */}
      {state?.connected && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/25 px-4 py-3">
          <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1 text-xs">
            <p className="font-bold text-emerald-800 dark:text-emerald-300">Whop Agent armed — connected and watching.</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              <span className="text-zinc-500 dark:text-zinc-500">Account:</span>{" "}
              <span className="font-mono">{state.whopAccountId ?? "—"}</span>
              {" · "}
              <span className="text-zinc-500 dark:text-zinc-500">Credential:</span>{" "}
              <span className="font-mono">{state.credentialType ?? "unknown"}</span>
              {" · "}
              <span className="text-zinc-500 dark:text-zinc-500">Pinned version:</span>{" "}
              <span className="font-mono">{state.pinnedVersionDate ?? "none — resolve before enabling webhook skills"}</span>
            </p>
          </div>
        </div>
      )}

      {state?.scopeProbeResults && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">Capabilities unlocked</h3>
            <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
              {Object.values(state.scopeProbeResults).filter((r) => r.ok).length}/{Object.values(state.scopeProbeResults).length} active
            </span>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {Object.entries(state.scopeProbeResults).map(([key, result]) => {
              const meta = PROBE_LABELS[key] ?? { label: key, locksWhat: "" };
              return (
                <div key={key} className="flex items-start gap-2 px-3 py-2">
                  {result.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{meta.label}</p>
                    {!result.ok && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {result.missingScope
                          ? `Missing permission: ${result.missingScope}`
                          : "Whop denied this without naming a reason."}
                        {meta.locksWhat ? ` — locks: ${meta.locksWhat}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state?.connected && (
        <div className="flex items-center justify-between">
          <a
            href={`/dashboard/engagements/${engagementId}/skills/whop-webhook-audit`}
            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:underline"
          >
            View webhook fleet console →
          </a>
          <button
            type="button"
            onClick={disconnect}
            disabled={submitting}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
          >
            Disconnect this Whop account
          </button>
        </div>
      )}
    </div>
  );
}
