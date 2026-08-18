"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2, X } from "lucide-react";

/**
 * Engagement-level pause/resume. Distinct from the per-run cancel button on
 * /dashboard/runs/[id] — that stops a run currently in flight; this stops
 * every future cron-triggered run from picking this engagement up at all,
 * until resumed. Doesn't touch stored credentials or delete anything.
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

  // 1. Paused State Control
  if (pausedAt) {
    return (
      <div className="inline-flex items-center gap-3 p-1.5 bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 rounded-xl border border-amber-500/30 shadow-xs dark:shadow-md">
        {/* Pause Badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg select-none border border-amber-200 dark:border-amber-500/20">
          <PauseCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Paused</span>
          {initialPausedReason && (
            <span className="text-xs font-normal text-amber-700/80 dark:text-amber-400/80 truncate max-w-[180px]" title={initialPausedReason}>
              — {initialPausedReason}
            </span>
          )}
        </div>

        {/* Resume Button */}
        <button
          type="button"
          onClick={resume}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500 dark:text-zinc-400" />
          ) : (
            <PlayCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-600/20 dark:fill-emerald-400/20" />
          )}
          <span>{busy ? "Resuming…" : "Resume"}</span>
        </button>

        {error && <span className="text-xs font-medium text-rose-600 dark:text-rose-400 px-2">{error}</span>}
      </div>
    );
  }

  // 2. Expanded Reason Input Form
  if (showReasonInput) {
    return (
      <div className="inline-flex items-center gap-2.5 p-1.5 bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 rounded-xl border border-border shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for pausing? (optional)"
          className="text-sm px-3.5 py-2 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60 w-64 sm:w-80 transition-all"
          onKeyDown={(e) => e.key === "Enter" && pause()}
        />

        <button
          type="button"
          onClick={pause}
          disabled={busy}
          className="inline-flex items-center justify-center text-sm font-semibold px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black shadow-xs transition-all active:scale-95 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm pause"}
        </button>

        <button
          type="button"
          onClick={() => setShowReasonInput(false)}
          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer select-none rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>

        {error && <span className="text-xs font-medium text-rose-600 dark:text-rose-400 px-2">{error}</span>}
      </div>
    );
  }

  // 3. Prominent Default Action Button
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowReasonInput(true)}
        className="group inline-flex items-center gap-2.5 text-sm font-semibold px-4 py-2.5 rounded-xl border border-border bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 shadow-xs transition-all active:scale-95 cursor-pointer"
      >
        <PauseCircle className="w-4.5 h-4.5 text-zinc-500 dark:text-zinc-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
        <span>Pause automation</span>
      </button>

      {error && <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  );
}