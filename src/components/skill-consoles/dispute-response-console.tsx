"use client";

import { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface DisputeAssembly {
  status: "window_closed" | "assembled";
  dispute?: { evidence_due_at?: string; evidence_editable?: boolean; evidence_locked_reason?: string };
  draft?: { notes: string; product_description?: string; service_date?: string };
  usedGeneratedResponse: boolean;
  gatheredManually: string[];
}

export function DisputeResponseConsole({ engagementId }: { engagementId: string }) {
  const [disputeId, setDisputeId] = useState("");
  const [assembly, setAssembly] = useState<DisputeAssembly | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  async function assemble() {
    if (!disputeId.trim()) return;
    setLoading(true);
    setError(null);
    setQueuedMessage(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/dispute-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setAssembly(body);
      setNotes(body.draft?.notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assemble the dispute response.");
    } finally {
      setLoading(false);
    }
  }

  async function queueSubmit() {
    if (!assembly?.draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/whop-agent/dispute-response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, draft: { ...assembly.draft, notes } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setQueuedMessage(`Submission queued as ${body.pendingActionId}. Approve from the Queue (needs elevated scope).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue the submission.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={disputeId}
          onChange={(e) => setDisputeId(e.target.value)}
          placeholder="Dispute id"
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono"
        />
        <button type="button" onClick={assemble} disabled={loading || !disputeId.trim()} className="rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 text-xs font-bold disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Assemble"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {queuedMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {queuedMessage}
        </div>
      )}

      {assembly?.status === "window_closed" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>Evidence window closed: {assembly.dispute?.evidence_locked_reason ?? "unknown reason"}. Not assembling a packet that cannot be filed.</p>
        </div>
      )}

      {assembly?.status === "assembled" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${assembly.dispute?.evidence_editable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"}`}>
              {assembly.dispute?.evidence_editable ? "Window open" : "Window closed"}
            </span>
            {assembly.dispute?.evidence_due_at && <span className="text-zinc-500">Due {assembly.dispute.evidence_due_at}</span>}
            {assembly.usedGeneratedResponse && <span className="text-zinc-500">Starting from Whop&apos;s own generated draft</span>}
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Narrative (notes field). Review before submitting</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono" />
          </div>

          {assembly.gatheredManually.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Attach manually: {assembly.gatheredManually.join(", ")}</p>
          )}

          <button
            type="button"
            onClick={queueSubmit}
            disabled={loading || assembly.dispute?.evidence_editable === false}
            className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold disabled:opacity-50"
          >
            Queue submission for approval
          </button>
        </div>
      )}
    </div>
  );
}
