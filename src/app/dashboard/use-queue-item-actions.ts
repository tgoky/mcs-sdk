"use client";

import { useCallback, useState } from "react";
import { QUEUE_COPY as copy } from "@/lib/copy";
import type { QueueItem } from "@/lib/queue";

/**
 * The real mutation logic behind every Queue action button (Approve/
 * Reject/Resolve/Dismiss, and the richer showed/rescheduled/not-sure
 * resolution for a sweep-inferred no-show) — extracted out of
 * queue-panel.tsx so a second surface showing the same items (the
 * dashboard's "Needs attention" overview tile) can offer the exact same
 * real actions instead of only linking elsewhere to go find them. One
 * copy of "which endpoint, which method, which body" per source/
 * category, not two independently-maintained guesses at it.
 *
 * onResolved fires once a mutation actually succeeds — each caller
 * decides what "closing" an item means for its own list (queue-panel.tsx
 * plays an exit animation before removing it; a shorter list elsewhere
 * can just filter it out immediately).
 */
export function useQueueItemActions(onResolved: (itemId: string) => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>(copy.errors.generic);

  const runMutation = useCallback(
    async (item: Pick<QueueItem, "id">, url: string, body?: object, method: "POST" | "PATCH" = "POST") => {
      setBusyId(item.id);
      setErrorId(null);
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const message =
            res.status === 403
              ? copy.errors.adminOnly
              : (await res.json().then((d) => d?.error).catch(() => null)) || copy.errors.generic;
          setErrorId(item.id);
          setErrorText(message);
          return;
        }
        onResolved(item.id);
      } catch {
        setErrorId(item.id);
        setErrorText(copy.errors.generic);
      } finally {
        setBusyId(null);
      }
    },
    [onResolved]
  );

  const decide = useCallback(
    (item: Pick<QueueItem, "id" | "source">, decision: string) => {
      if (item.source === "action") return runMutation(item, `/api/actions/${item.id}/review`, { decision });
      if (item.source === "blocker") return runMutation(item, `/api/blockers/${item.id}/resolve`, { decision });
      return runMutation(item, `/api/notifications/${item.id}/read`);
    },
    [runMutation]
  );

  // Richer resolution for a sweep-inferred no-show — see
  // QueueItem.sweepNoShowReview's doc. Logs the real outcome (via the
  // general per-booking endpoint, same one the master roster's inline
  // buttons use) before closing out the pending action, instead of a
  // plain reject that recorded nothing and left the booking's own status
  // exactly as ambiguous as it was before the sweep ever looked at it.
  const resolveSweepNoShow = useCallback(
    async (item: Pick<QueueItem, "id" | "engagementId" | "sweepNoShowReview">, outcome: "showed" | "rescheduled") => {
      if (!item.engagementId || !item.sweepNoShowReview) return;
      setBusyId(item.id);
      setErrorId(null);
      try {
        const res = await fetch(`/api/engagements/${item.engagementId}/bookings/${item.sweepNoShowReview.bookingId}/outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        });
        if (!res.ok) {
          const message =
            res.status === 403
              ? copy.errors.adminOnly
              : (await res.json().then((d) => d?.error).catch(() => null)) || copy.errors.generic;
          setErrorId(item.id);
          setErrorText(message);
          return;
        }
        // The real outcome is on file now — this pending action's own
        // question is already answered, so close it the same way a plain
        // reject would, just with something more specific already recorded.
        await fetch(`/api/actions/${item.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "rejected" }),
        }).catch(() => {});
        onResolved(item.id);
      } catch {
        setErrorId(item.id);
        setErrorText(copy.errors.generic);
      } finally {
        setBusyId(null);
      }
    },
    [onResolved]
  );

  const dismissSyncSetup = useCallback(
    (item: Pick<QueueItem, "id" | "engagementId">) => {
      if (!item.engagementId) return;
      return runMutation(item, `/api/engagements/${item.engagementId}/sync-mode`, { dismissSetupNudge: true }, "PATCH");
    },
    [runMutation]
  );

  const dismissRunFailure = useCallback(
    (item: Pick<QueueItem, "id" | "engagementId" | "skillName">) => {
      if (!item.engagementId || !item.skillName) return;
      return runMutation(item, `/api/engagements/${item.engagementId}/dismiss-run-failure`, { skillName: item.skillName }, "PATCH");
    },
    [runMutation]
  );

  return { busyId, errorId, errorText, runMutation, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure };
}
