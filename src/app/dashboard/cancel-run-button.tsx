"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";

/**
 * Confirm-then-cancel control for an in-progress skill run. Calls the
 * existing POST /api/skill-runs/[id]/cancel endpoint — this component
 * owns no new mutation logic, just the two-step confirm UI, shared
 * between the run detail page and the engagement module cards so a
 * stuck run can be stopped from either place instead of only after
 * clicking through to /dashboard/runs/[id].
 */
export function CancelRunButton({
  runId,
  onCancelled,
  size = "md",
}: {
  runId: string;
  onCancelled?: () => void;
  size?: "sm" | "md";
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const padding = size === "sm" ? "px-2 py-1" : "px-2.5 py-1";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/skill-runs/${runId}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to cancel run.");
        return;
      }
      setConfirming(false);
      onCancelled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel run.");
    } finally {
      setCancelling(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true); }}
        className={`inline-flex items-center gap-1.5 ${textSize} font-bold font-mono ${padding} rounded-full border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer relative z-10`}
      >
        <Ban size={size === "sm" ? 11 : 13} />
        Cancel run
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 relative z-10">
      <div className={`inline-flex items-center gap-2 ${textSize} font-mono`}>
        <span className="text-zinc-400 dark:text-zinc-500">Stop this run?</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancel(); }}
          disabled={cancelling}
          className={`inline-flex items-center gap-1.5 font-bold ${padding} rounded-full border border-rose-300 dark:border-rose-900/50 text-rose-600 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50 cursor-pointer`}
        >
          {cancelling ? <Loader2 size={size === "sm" ? 11 : 13} className="animate-spin" /> : <Ban size={size === "sm" ? 11 : 13} />}
          {cancelling ? "Cancelling…" : "Confirm"}
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); setError(null); }}
          disabled={cancelling}
          className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 px-1.5 py-1 disabled:opacity-50 cursor-pointer font-bold"
        >
          Back
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-300 font-mono">{error}</p>}
    </div>
  );
}
