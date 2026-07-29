"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, RotateCcw, Ban, CheckCheck, Loader2 } from "lucide-react";
import { ActionMenu, ActionMenuSection, ActionMenuItem } from "@/components/action-menu";

const ACTIVE_STATUSES = new Set(["running", "in_progress", "queued", "pending"]);
const FAILED_STATUSES = new Set(["failed", "error", "timed_out"]);

/**
 * Row-level "…" menu for Run History — lets someone cancel, retry, or
 * dismiss a run's failure right from the list instead of clicking through
 * to /dashboard/runs/[id] first. Sits on top of the row's own absolute
 * full-row Link (see page.tsx), so clicks here need relative z-20 plus
 * stopPropagation/preventDefault to not also trigger the row navigation.
 */
export function RunRowActions({
  runId,
  engagementId,
  skillName,
  skillLabel,
  status,
}: {
  runId: string;
  engagementId: string;
  skillName: string;
  skillLabel: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"cancel" | "retry" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (!confirmingCancel) return;
    const t = setTimeout(() => setConfirmingCancel(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingCancel]);

  const s = status.toLowerCase();
  const isActive = ACTIVE_STATUSES.has(s);
  const isFailed = FAILED_STATUSES.has(s);

  async function cancelRun(onDone: () => void) {
    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/skill-runs/${runId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel.");
        return;
      }
      setConfirmingCancel(false);
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    } finally {
      setBusy(null);
    }
  }

  async function retryRun(onDone: () => void) {
    setBusy("retry");
    setError(null);
    try {
      const res = await fetch("/api/skill-runs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, skillName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to start a new run.");
        return;
      }
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start a new run.");
    } finally {
      setBusy(null);
    }
  }

  async function dismissFailure(onDone: () => void) {
    setBusy("dismiss");
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/dismiss-run-failure`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to dismiss.");
        return;
      }
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ActionMenu
      align="end"
      trigger={({ toggle, open }) => (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Actions for this ${skillLabel} run`}
          className="relative z-20 p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
    >
      {(close) => (
        <ActionMenuSection label={skillLabel}>
          <ActionMenuItem icon={Eye} label="View run details" href={`/dashboard/runs/${runId}`} />

          {isActive && (
            <ActionMenuItem
              icon={busy === "cancel" ? Loader2 : Ban}
              label={
                busy === "cancel"
                  ? "Cancelling…"
                  : confirmingCancel
                  ? "Click again to confirm"
                  : "Cancel this run"
              }
              tone="danger"
              disabled={busy === "cancel"}
              onClick={() => {
                if (!confirmingCancel) {
                  setConfirmingCancel(true);
                  return;
                }
                cancelRun(close);
              }}
            />
          )}

          {!isActive && (
            <ActionMenuItem
              icon={busy === "retry" ? Loader2 : RotateCcw}
              label={busy === "retry" ? "Starting…" : "Retry — run again now"}
              disabled={busy === "retry"}
              onClick={() => retryRun(close)}
            />
          )}

          {isFailed && (
            <ActionMenuItem
              icon={busy === "dismiss" ? Loader2 : CheckCheck}
              label={busy === "dismiss" ? "Dismissing…" : "Dismiss this failure"}
              description="Stops it showing in your failure queue"
              disabled={busy === "dismiss"}
              onClick={() => dismissFailure(close)}
            />
          )}

          {error && <p className="px-2.5 pt-1 text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
        </ActionMenuSection>
      )}
    </ActionMenu>
  );
}
