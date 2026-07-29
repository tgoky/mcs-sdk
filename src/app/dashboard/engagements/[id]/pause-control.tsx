"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

  // 1. Paused State Pill
  if (pausedAt) {
    return (
      <div className="inline-flex items-center gap-2 p-1 bg-black/40 backdrop-blur-md rounded-2xl border border-amber-500/20 shadow-xs">
        <div className="flex items-center gap-2 px-3 py-1 text-xs font-sans font-medium text-amber-300 bg-amber-500/10 rounded-xl select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span>Paused</span>
          {initialPausedReason && (
            <span className="text-[11px] text-amber-400/70 truncate max-w-[120px]" title={initialPausedReason}>
              ({initialPausedReason})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={resume}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-sans font-semibold text-zinc-200 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-white/10 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          ) : (
            <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{busy ? "Resuming…" : "Resume"}</span>
        </button>

        {error && <span className="text-xs font-sans text-rose-400 px-2">{error}</span>}
      </div>
    );
  }

  // 2. Reason Input Prompt
  if (showReasonInput) {
    return (
      <div className="inline-flex items-center gap-2 p-1 bg-[#222225]/90 backdrop-blur-2xl rounded-2xl border border-white/15 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for pausing? (optional)"
          className="text-xs font-sans px-3 py-1.5 rounded-xl border border-white/10 bg-black/40 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 w-48 sm:w-56 transition-all"
          onKeyDown={(e) => e.key === "Enter" && pause()}
        />

        <button
          type="button"
          onClick={pause}
          disabled={busy}
          className="inline-flex items-center justify-center text-xs font-sans font-semibold px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black shadow-xs transition-all duration-150 active:scale-95 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
        </button>

        <button
          type="button"
          onClick={() => setShowReasonInput(false)}
          className="text-xs font-sans text-zinc-400 hover:text-zinc-200 px-2 py-1.5 transition-colors cursor-pointer select-none"
        >
          Cancel
        </button>

        {error && <span className="text-xs font-sans text-rose-400 px-2">{error}</span>}
      </div>
    );
  }

  // 3. Default Active State Button
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowReasonInput(true)}
        className="group inline-flex items-center gap-2 text-xs font-sans font-medium px-3.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:text-amber-300 hover:border-amber-500/30 hover:bg-amber-500/10 shadow-xs transition-all duration-150 active:scale-95 cursor-pointer"
      >
        <PauseCircle className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
        <span>Pause automation</span>
      </button>

      {error && <span className="text-xs font-sans text-rose-400">{error}</span>}
    </div>
  );
}