"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Co-Pilot / Autopilot toggle for this engagement's confirmation_page_deploy
 * step (see src/lib/approval-gate.ts). Co-Pilot queues actions for
 * review in the dashboard queue; Autopilot executes immediately.
 *
 * Deliberately asymmetric: Co-Pilot -> Autopilot needs a confirm click,
 * Autopilot -> Co-Pilot doesn't.
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

  // 1. Confirmation state when switching to Autopilot
  if (confirming) {
    return (
      <div className="p-2.5 rounded-xl border border-border bg-zinc-50 dark:bg-zinc-900/50 space-y-2 select-none">
        <p className="text-xs font-sans text-zinc-700 dark:text-zinc-300 leading-normal">
          Switch to Autopilot? Actions will publish immediately without manual approval.
        </p>
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setMode(false)}
            disabled={busy}
            className="inline-flex items-center justify-center text-xs font-sans font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Autopilot"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-sans font-medium px-2.5 py-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  // 2. Co-Pilot Mode State
  if (requireApproval) {
    return (
      <div className="space-y-1 select-none">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className={cn(
            "group w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer",
            "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {busy ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-zinc-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors" />
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-sans font-medium leading-snug">
                Co-Pilot mode
              </span>
              <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-normal truncate">
                Click to switch to Autopilot
              </span>
            </div>
          </div>
        </button>
        {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400 px-2.5">{error}</p>}
      </div>
    );
  }

  // 3. Autopilot Mode State
  return (
    <div className="space-y-1 select-none">
      <button
        type="button"
        onClick={() => setMode(true)}
        disabled={busy}
        className={cn(
          "group w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer",
          "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {busy ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-zinc-400" />
          ) : (
            <Bot className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-sans font-medium leading-snug">
              Autopilot mode
            </span>
            <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-normal truncate">
              Click to switch to Co-Pilot
            </span>
          </div>
        </div>
      </button>
      {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400 px-2.5">{error}</p>}
    </div>
  );
}