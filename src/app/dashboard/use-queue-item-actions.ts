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
  // Per row, not one shared slot: with a single busyId, the first of two
  // in-flight actions to finish re-enabled the other row's buttons (and a
  // second error replaced the first row's message).
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const setError = useCallback((id: string, message: string | null) => {
    setErrors((prev) => {
      const next = new Map(prev);
      if (message === null) next.delete(id);
      else next.set(id, message);
      return next;
    });
  }, []);

  const runMutation = useCallback(
    async (item: Pick<QueueItem, "id">, url: string, body?: object, method: "POST" | "PATCH" = "POST") => {
      setBusy(item.id, true);
      setError(item.id, null);
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
          setError(item.id, message);
          return;
        }
        onResolved(item.id);
      } catch {
        setError(item.id, copy.errors.generic);
      } finally {
        setBusy(item.id, false);
      }
    },
    [onResolved, setBusy, setError]
  );

  const decide = useCallback(
    (item: Pick<QueueItem, "id" | "source">, decision: string) => {
      if (item.source === "action") return runMutation(item, `/api/actions/${item.id}/review`, { decision });
      if (item.source === "blocker") return runMutation(item, `/api/blockers/${item.id}/resolve`, { decision });
      // No decision body — a queue-worthy reply has exactly one terminal
      // state (handled), not an approve/reject or resolve/abandon choice.
      if (item.source === "cold_open_reply") return runMutation(item, `/api/cold-open-replies/${item.id}/resolve`);
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
      setBusy(item.id, true);
      setError(item.id, null);
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
          setError(item.id, message);
          return;
        }
        // The real outcome is on file now — this pending action's own
        // question is already answered, so close it the same way a plain
        // reject would, just with something more specific already recorded.
        // If closing it fails, say so and keep the row: reporting success
        // here used to leave the action pending while the list hid it.
        const closed = await fetch(`/api/actions/${item.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "rejected" }),
        })
          .then((r) => r.ok)
          .catch(() => false);
        if (!closed) {
          setError(item.id, "The outcome was saved, but this item couldn't be closed. Try again.");
          return;
        }
        onResolved(item.id);
      } catch {
        setError(item.id, copy.errors.generic);
      } finally {
        setBusy(item.id, false);
      }
    },
    [onResolved, setBusy, setError]
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

  return { busyIds, errors, runMutation, decide, resolveSweepNoShow, dismissSyncSetup, dismissRunFailure };
}
