// src/app/dashboard/use-notifications.ts
//
// Extracted from notification-bell.tsx (2026-08-23) so the unread count
// (rail badge) and the full list (right-utility-panel's Notifications tab)
// share one poller instead of two independent /api/notifications intervals.

import { useCallback, useEffect, useState } from "react";

export interface NotificationRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  runId: string | null;
  engagementId: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

export function useNotifications() {
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setNotifs(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silent — includes AbortError from a cancelled in-flight request on
      // unmount. A failed poll shouldn't throw a visible error at the user
      // either way; it'll just try again on the next interval.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await load(controller.signal);
    })();
    const interval = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [load]);

  const markAllRead = useCallback(async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications/all/read", { method: "POST" }).catch(() => {});
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  return { notifs, unreadCount, markAllRead, markRead };
}
