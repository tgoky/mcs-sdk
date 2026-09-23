"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/toast-provider";
import { OPT_IN_GATED_ACTIONS } from "@/lib/approval-actions";

type OptInType = (typeof OPT_IN_GATED_ACTIONS)[number]["type"];
const ALL_TYPES = OPT_IN_GATED_ACTIONS.map((a) => a.type) as OptInType[];

/**
 * This client's automation mode — the one place it's set now that the
 * workspace-wide Autopilot page is gone.
 *
 * Co-Pilot: the actions ticked below wait in the queue for approval.
 * Autopilot: they run right away. Reputation Manager drafts and Whop Agent
 * changes always wait for approval either way (approval-actions.ts
 * explains why they aren't listed).
 *
 * Saved through PATCH /api/engagements/[id]. This used to post to an
 * /approval-mode route that doesn't exist, so switching modes here always
 * failed. Switching to Autopilot still asks for a confirm click; switching
 * back doesn't.
 */
export function ApprovalModeToggle({
  engagementId,
  initialRequireApproval,
  initialActionTypes = [],
}: {
  engagementId: string;
  initialRequireApproval: boolean;
  /** Stored scope; empty (or only non-opt-in types) means every action below. */
  initialActionTypes?: readonly string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [requireApproval, setRequireApproval] = useState(initialRequireApproval);
  const [selected, setSelected] = useState<OptInType[]>(() => {
    const valid = ALL_TYPES.filter((t) => initialActionTypes.includes(t));
    return valid.length > 0 ? valid : ALL_TYPES;
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(stackPatch: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stack: stackPatch }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setMode(nextRequireApproval: boolean) {
    const ok = await save({
      require_approval_for_side_effects: nextRequireApproval,
      // An empty list means "every action", which is what "all ticked" is.
      require_approval_action_types: selected.length === ALL_TYPES.length ? [] : selected,
    });
    if (!ok) return;
    setRequireApproval(nextRequireApproval);
    setConfirming(false);
    toast.success(nextRequireApproval ? "Switched to Co-Pilot: the ticked actions wait for your approval." : "Switched to Autopilot: actions run right away.");
  }

  async function toggleType(type: OptInType) {
    const next = selected.includes(type) ? selected.filter((t) => t !== type) : [...selected, type];
    // An empty list would mean "review everything" to the gate, the opposite
    // of unticking the last box, so keep at least one.
    if (next.length === 0) {
      setError("Keep at least one ticked, or switch to Autopilot to review nothing.");
      return;
    }
    const previous = selected;
    setSelected(next);
    const ok = await save({ require_approval_action_types: next.length === ALL_TYPES.length ? [] : next });
    if (!ok) setSelected(previous);
  }

  if (confirming) {
    return (
      <div className="p-2.5 rounded-xl border border-border bg-zinc-50 dark:bg-zinc-900/50 space-y-2 select-none">
        <p className="text-xs font-sans text-zinc-700 dark:text-zinc-300 leading-normal">
          Switch to Autopilot? Confirmation pages, sequence enrollments and ad-audience changes will run without waiting for you.
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

  const Icon = requireApproval ? ShieldCheck : Bot;
  return (
    <div className="space-y-1.5 select-none">
      <button
        type="button"
        onClick={() => (requireApproval ? setConfirming(true) : setMode(true))}
        disabled={busy}
        className={cn(
          "group w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer",
          "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {busy ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-zinc-400" /> : <Icon className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" />}
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-sans font-medium leading-snug">{requireApproval ? "Co-Pilot mode" : "Autopilot mode"}</span>
            <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-normal">
              {requireApproval ? "Ticked actions wait for your approval. Click to switch to Autopilot." : "Actions run right away. Click to switch to Co-Pilot."}
            </span>
          </div>
        </div>
      </button>

      {requireApproval && (
        <div className="px-2.5 space-y-1">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-400">Ask before</p>
          {OPT_IN_GATED_ACTIONS.map((action) => (
            <label key={action.type} className="flex items-start gap-2 text-[12px] font-sans text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 cursor-pointer"
                checked={selected.includes(action.type)}
                disabled={busy}
                onChange={() => toggleType(action.type)}
              />
              <span>
                {action.label} <span className="text-zinc-400">({action.worker})</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="px-2.5 text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
        Reputation Manager drafts and Whop Agent changes always wait for your approval.
      </p>
      {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400 px-2.5">{error}</p>}
    </div>
  );
}
