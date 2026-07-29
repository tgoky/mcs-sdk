"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Zap } from "lucide-react";

/**
 * Co-Pilot / Autopilot toggle for this engagement's confirmation_page_deploy
 * step (see src/lib/approval-gate.ts). Co-Pilot queues the publish for
 * review in the dashboard queue; Autopilot publishes immediately.
 *
 * Deliberately asymmetric: Co-Pilot -> Autopilot needs a confirm click,
 * Autopilot -> Co-Pilot doesn't. Adding a review step should never need
 * friction; removing one should always need a little.
 */
export function ApprovalModeToggle({
  engagementId,
  initialRequireApproval,
}: {
  engagementId: string;
  initialRequireApproval: boolean;
}) {
  const router = useRouter();
  const [requireApproval, setRequireApproval] = useState(initialRequireApproval);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setMode(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/approval-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApproval: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequireApproval(next);
        setConfirming(false);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to update.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 leading-relaxed">
          Switch to Autopilot? The confirmation page will publish immediately, no review.
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(false)}
            disabled={busy}
            className="text-[11px] font-mono font-bold px-2 py-1 rounded-sm border border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {busy ? "Switching…" : "Confirm Autopilot"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (requireApproval) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="inline-flex items-start gap-1.5 text-[11px] font-mono font-bold text-gold-hover dark:text-gold bg-gold/10 border border-gold/25 px-2 py-1.5 rounded-md leading-snug">
          <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" /> Co-Pilot — confirmation page needs your approval to publish
        </span>
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="text-[11px] font-mono font-bold px-2 py-1 rounded-sm border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-50 transition-all cursor-pointer"
        >
          Switch to Autopilot
        </button>
        {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="inline-flex items-start gap-1.5 text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-900/60 px-2 py-1.5 rounded-md leading-snug">
        <Zap className="w-3 h-3 mt-0.5 shrink-0" /> Autopilot — confirmation page publishes automatically
      </span>
      <button
        onClick={() => setMode(true)}
        disabled={busy}
        className="text-[11px] font-mono font-bold px-2 py-1 rounded-sm border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-gold/40 hover:text-gold-hover dark:hover:text-gold transition-all cursor-pointer disabled:opacity-50"
      >
        {busy ? "Switching…" : "Switch to Co-Pilot"}
      </button>
      {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  );
}
