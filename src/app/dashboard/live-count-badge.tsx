"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Matches LiveExecutionFeed's own poll cadence (see the `polling` effect in
 * live-execution-feed.tsx) so the sidebar count and the feed content it's
 * summarizing never drift more than a few seconds apart from each other.
 */
const POLL_MS = 5_000;

/**
 * The count-badge half of "Executions" nav item, split out of
 * WorkSidebar/SidebarNavLinks so it can keep polling
 * /api/skill-runs/running-count client-side. WorkSidebar (a Suspense RSC
 * inside dashboard/layout.tsx) only re-runs its DB query on a full
 * navigation into /dashboard — it doesn't re-render on client-side route
 * changes, and nothing pings it when a background job (cron, webhook,
 * Inngest) flips a run to "running" while the buyer is already sitting on
 * a page. Inbox and Queue's badge counts have this same underlying
 * limitation; this component is scoped to Executions because that's the
 * one asked for live behavior — see work-sidebar.tsx for where it's wired
 * in.
 *
 * Renders nothing when the count is 0, same as the static badge it
 * replaces (SidebarNavLinks' `link.count !== undefined && link.count > 0`
 * guard) — a run instantly reappearing in the feed is expected; the badge
 * disappearing when nothing's running isn't a bug.
 */
export function LiveCountBadge({
  initialCount,
  active,
}: {
  initialCount: number;
  active: boolean;
}) {
  const [count, setCount] = useState(initialCount);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/skill-runs/running-count", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setCount(Number(data.count ?? 0));
    } catch {
      // Silent, same as NotificationBell's poll — includes AbortError on
      // unmount; a missed tick just tries again in POLL_MS.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [load]);

  if (count <= 0) return null;

  return (
    <span
      className={`ml-auto shrink-0 px-1.5 py-[1px] rounded-full text-[11px] font-mono font-medium transition-colors ${
        active ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
      }`}
    >
      {count}
    </span>
  );
}
