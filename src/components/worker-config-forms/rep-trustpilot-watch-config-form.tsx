"use client";

// Trustpilot Watch has no persisted settings — it already reviews the
// domain captured in Identity Setup on a schedule. The one real gap was
// that Outscraper's own documented `cutoff` param (verified against their
// /trustpilot-reviews reference docs — see trustpilot-watch-service.ts's
// runRepTrustpilotDeepScan) was only reachable through Teammates chat.
// This calls the exact same trigger function chat does.

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { InputField } from "@/app/dashboard/engagements/new/form-fields";

const TODAY = new Date().toISOString().slice(0, 10);

export function RepTrustpilotWatchConfigForm({
  engagementId,
  onCancel,
  cancelLabel = "Back to client",
}: {
  engagementId: string;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [sinceDate, setSinceDate] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(sinceDate) && sinceDate <= TODAY;

  async function runScan() {
    if (!valid) return;
    setRunning(true);
    setError(null);
    setRunId(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/rep-findings/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trustpilot_deep_scan", deepScanSinceDate: sinceDate }),
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
          Trustpilot Watch
        </h1>
        <p className="text-xs font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
          The scheduled watch already checks the domain from Identity Setup daily, newest reviews first. Nothing to
          tune there. This reaches further back than that daily window, in one deeper pull.
        </p>
      </div>

      <InputField
        label="Scan back to"
        type="date"
        value={sinceDate}
        onChange={setSinceDate}
        required
        helpText="Pulls every Trustpilot review published since this date, scores what's new, and adds it to this client's findings, using the same pipeline as the daily watch."
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
          disabled={running || !valid}
          className="px-5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs active:translate-y-px"
        >
          {running ? "Scanning…" : "Scan Trustpilot deeper"}
        </button>
      </div>
    </div>
  );
}
