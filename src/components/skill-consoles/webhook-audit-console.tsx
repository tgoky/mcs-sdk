"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Copy } from "lucide-react";

interface DuplicateGroup {
  groupKey: string;
  whopWebhookIds: string[];
  url: string;
  events: string[];
}

interface WebhookAuditReport {
  total: number;
  unpinned: string[];
  unverifiable: string[];
  duplicateGroups: DuplicateGroup[];
  alreadyDisabled: Array<{ whopWebhookId: string; disabledReason: string | null }>;
}

/**
 * Section 11.2 — the webhook fleet console, and per the spec's own framing
 * "the connect flow's first-run payoff": a real Grow Today-style account
 * probe would surface duplicate unpinned subscriptions and a silently
 * failing one here, none of which any native Whop dashboard surface flags.
 */
export function WebhookAuditConsole({ engagementId: id }: { engagementId: string }) {
  const [report, setReport] = useState<WebhookAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/engagements/${id}/whop-agent/webhooks`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Failed to load the webhook fleet.");
        setReport(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the webhook fleet."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function queuePin(whopWebhookId: string) {
    setBusyKey(whopWebhookId);
    setQueuedMessage(null);
    try {
      const res = await fetch(`/api/engagements/${id}/whop-agent/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pin", whopWebhookId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setQueuedMessage(`Pin for ${whopWebhookId} queued. Approve it from the Queue.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue the pin.");
    } finally {
      setBusyKey(null);
    }
  }

  async function queueDedupe(groupKey: string) {
    setBusyKey(groupKey);
    setQueuedMessage(null);
    try {
      const res = await fetch(`/api/engagements/${id}/whop-agent/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dedupe", groupKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setQueuedMessage(`Dedupe queued. Approve it from the Queue to remove the duplicate subscription(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue the dedupe.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4 font-sans antialiased">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Re-audit
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {queuedMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {queuedMessage}
        </div>
      )}

      {!loading && report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total subscriptions" value={report.total} />
            <StatTile label="Unpinned" value={report.unpinned.length} tone={report.unpinned.length ? "warn" : "ok"} />
            <StatTile label="Duplicate groups" value={report.duplicateGroups.length} tone={report.duplicateGroups.length ? "warn" : "ok"} />
            <StatTile label="Already disabled" value={report.alreadyDisabled.length} tone={report.alreadyDisabled.length ? "warn" : "ok"} />
          </div>

          {report.duplicateGroups.length > 0 && (
            <Section title="Duplicate subscriptions" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}>
              {report.duplicateGroups.map((group) => (
                <div key={group.groupKey} className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">
                    <Copy className="inline w-3 h-3 mr-1 -mt-0.5" />
                    {group.whopWebhookIds.length} subscriptions point at <span className="font-mono">{group.url}</span> for{" "}
                    <span className="font-mono">{group.events.join(", ")}</span> : every matching event fires this receiver {group.whopWebhookIds.length}x.
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">{group.whopWebhookIds.join(", ")}</p>
                  <button
                    type="button"
                    onClick={() => queueDedupe(group.groupKey)}
                    disabled={busyKey === group.groupKey}
                    className="text-xs font-bold text-white bg-zinc-900 dark:bg-white dark:text-zinc-900 rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {busyKey === group.groupKey ? "Queuing…" : "Queue dedupe (keeps healthiest, removes the rest)"}
                  </button>
                </div>
              ))}
            </Section>
          )}

          {report.unpinned.length > 0 && (
            <Section title="Unpinned subscriptions" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}>
              {report.unpinned.map((whopWebhookId) => (
                <div key={whopWebhookId} className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                  <span className="text-xs font-mono">{whopWebhookId}</span>
                  <button
                    type="button"
                    onClick={() => queuePin(whopWebhookId)}
                    disabled={busyKey === whopWebhookId}
                    className="text-xs font-bold text-white bg-zinc-900 dark:bg-white dark:text-zinc-900 rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {busyKey === whopWebhookId ? "Queuing…" : "Queue pin"}
                  </button>
                </div>
              ))}
            </Section>
          )}

          {report.unverifiable.length > 0 && (
            <Section title="Unverifiable envelopes (v2/v5)" icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                These carry an api_version of v2 or v5 and lack Standard Webhooks signatures. They cannot be HMAC-verified. The agent
                will never create one; these were found on the existing fleet.
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-1">{report.unverifiable.join(", ")}</p>
            </Section>
          )}

          {report.alreadyDisabled.length > 0 && (
            <Section title="Already disabled" icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}>
              {report.alreadyDisabled.map((d) => (
                <p key={d.whopWebhookId} className="text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="font-mono">{d.whopWebhookId}</span> : {d.disabledReason ?? "no reason recorded"}. Not re-enabled
                  automatically; use the receiver health workspace once it detects a passing probe.
                </p>
              ))}
            </Section>
          )}

          {report.unpinned.length === 0 && report.duplicateGroups.length === 0 && report.alreadyDisabled.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Every subscription is pinned, healthy, and free of duplicates.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const color = tone === "warn" && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
        {icon} {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
