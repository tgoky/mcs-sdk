"use client";

// Reddit Watch has no persisted settings — it already searches the
// operator name and high-priority entity names from Identity Setup on a
// schedule. The one real gap was that redditapis.com's documented sort=top
// + t=<timeframe> technique for reaching further back (verified against
// their own reference docs — see reddit-watch-service.ts's
// runRepRedditDeepScan) was only reachable through Teammates chat. This
// calls the exact same trigger function chat does.

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SelectField } from "@/app/dashboard/engagements/new/form-fields";

const TIMEFRAMES = [
  { value: "day", label: "Past day" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "all", label: "All time" },
];

export function RepRedditWatchConfigForm({
  engagementId,
  onCancel,
  cancelLabel = "Back to client",
}: {
  engagementId: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [timeframe, setTimeframe] = useState("month");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runScan() {
    setRunning(true);
    setError(null);
    setRunId(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reddit_deep_scan", deepScanTimeframe: timeframe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start the scan.");
        return;
      }
      setRunId(data.runId ?? null);
      setMessage(data.message ?? "Scan started.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto px-4 py-6" style={{ color: "var(--text-secondary)" }}>
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Reddit Watch
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          The scheduled watch already searches recency-sorted for the operator name and high-priority entities from
          Identity Setup daily, nothing to tune there. Reddit has no exact date-cutoff parameter like Trustpilot or
          X do, so widening the scan means picking a top-ranked timeframe instead, each one is a genuinely separate
          listing, not a deeper page of the same search.
        </p>
      </div>

      <SelectField
        label="Widen scan to"
        value={timeframe}
        onChange={setTimeframe}
        options={TIMEFRAMES}
        helpText="Re-searches sorted by top posts in this window and adds anything the daily watch's recency-sorted search hasn't already found."
      />

      {error && (
        <p className="text-xs font-mono font-semibold" style={{ color: "var(--error)" }}>
          ⚠ {error}
        </p>
      )}
      {message && !error && (
        <p className="text-xs font-mono font-semibold flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          ✓ {message}
          {runId && (
            <a href={`/dashboard/runs/${runId}`} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200">
              View run <ArrowUpRight className="w-3 h-3" />
            </a>
          )}
        </p>
      )}

      <div className="flex justify-between pt-4 font-mono" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 shadow-xs"
        >
          {cancelLabel}
        </button>
        <button
          onClick={runScan}
          disabled={running}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {running ? "Scanning…" : "Widen Reddit scan"}
        </button>
      </div>
    </div>
  );
}
