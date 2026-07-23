"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle } from "lucide-react";

/**
 * Engagement-level pause/resume. Distinct from the per-run cancel button on
 * /dashboard/runs/[id] — that stops a run currently in flight; this stops
 * every future cron-triggered run (nightly briefs, leak map, dynamic
 * brief, booking poll, win-back sweep, weekly metrics, credential health)
 * from picking this engagement up at all, until resumed. Doesn't touch
 * stored credentials or delete anything.
 */
export function EngagementPauseControl({
  engagementId,
  initialPausedAt,
  initialPausedReason,
}: {
  engagementId: string;
  initialPausedAt: string | null;
  initialPausedReason: string | null;
}) {
  const router = useRouter();
  const [pausedAt, setPausedAt] = useState(initialPausedAt);
  const [busy, setBusy] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function pause() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setPausedAt(data.pausedAt);
        setShowReasonInput(false);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to pause.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pause`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setPausedAt(null);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to resume.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (pausedAt) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-2 py-1 rounded">
          <PauseCircle className="w-3 h-3" /> Paused — no new runs will start
        </span>
        <button
          onClick={resume}
          disabled={busy}
          className="text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-50 transition-all cursor-pointer inline-flex items-center gap-1"
        >
          <PlayCircle className="w-3 h-3" /> {busy ? "Resuming…" : "Resume"}
        </button>
        {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
    );
  }

  if (showReasonInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why? (optional)"
          className="text-[11px] font-mono px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 w-40"
          onKeyDown={(e) => e.key === "Enter" && pause()}
        />
        <button
          onClick={pause}
          disabled={busy}
          className="text-[11px] font-mono font-bold px-2 py-1 rounded border border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 disabled:opacity-50 transition-all cursor-pointer"
        >
          {busy ? "Pausing…" : "Confirm pause"}
        </button>
        <button
          onClick={() => setShowReasonInput(false)}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowReasonInput(true)}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-amber-300 dark:hover:border-amber-900/60 hover:text-amber-700 dark:hover:text-amber-400 transition-all cursor-pointer"
      >
        <PauseCircle className="w-3 h-3" /> Pause automation
      </button>
      {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  );
}
