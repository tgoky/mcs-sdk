"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * Two numbers, one badge:
 *  - count: runs in "running" right now. Solid pill, same treatment this
 *    badge always had.
 *  - unseenCount: runs that finished since the user last visited
 *    /dashboard/runs (see getUnseenCompletedExecutionCount, run-log.ts) —
 *    the actual fix for "a run starts and finishes between glances and
 *    the badge just goes back to 0 with no trace anything happened."
 *    Shown as an outlined pill (ring, not fill) rather than a new color,
 *    to keep the dashboard's existing no-status-color convention — same
 *    zinc palette, distinguished by shape/weight only, but visually
 *    distinct from "actively running right now."
 *
 * If both are 0, nothing renders — a run instantly reappearing (count) or
 * a first-ever visit with nothing to catch up on (unseenCount) is
 * expected, not a bug.
 */
export function LiveCountBadge({
  initialCount,
  initialUnseenCount,
  active,
}: {
  initialCount: number;
  initialUnseenCount: number;
  active: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [unseenCount, setUnseenCount] = useState(initialUnseenCount);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/skill-runs/running-count", { cache: "no-store", signal });
      if (signal.aborted || !res.ok) return;
      const data = await res.json();
      if (signal.aborted) return;
      setCount(Number(data.count ?? 0));
      setUnseenCount(Number(data.unseenCompleted ?? 0));
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

  // Running takes priority when both are nonzero — "N running" is the more
  // urgent, more current fact; the unseen-completed count is still sitting
  // there waiting and will show again the moment nothing's actively running.
  const displayValue = count > 0 ? count : unseenCount > 0 ? unseenCount : null;
  const justChanged = useCountBump(displayValue);

  if (count > 0) {
    return (
      <span
        className={`ml-auto shrink-0 px-1.5 py-[1px] rounded-full text-[11px] font-mono font-medium tabular-nums transition-colors ${justChanged ? "count-bump" : ""} ${
          active ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
        }`}
      >
        {count}
      </span>
    );
  }

  if (unseenCount > 0) {
    return (
      <span
        title={`${unseenCount} run${unseenCount === 1 ? "" : "s"} finished since you last checked`}
        className={`ml-auto shrink-0 px-1.5 py-[1px] rounded-full text-[11px] font-mono font-medium tabular-nums border transition-colors ${justChanged ? "count-bump" : ""} ${
          active ? "border-zinc-500 text-zinc-200" : "border-zinc-700 text-zinc-400 group-hover:text-zinc-200 group-hover:border-zinc-600"
        }`}
      >
        {unseenCount}
      </span>
    );
  }

  return null;
}

/**
 * True for one animation cycle right after `value` changes (and only once
 * mounted — a badge's first paint shouldn't bump). Confirmation that the
 * number moved, not decoration: a crisp scale pulse via CSS (.count-bump,
 * globals.css), no color change, so it survives both the solid and
 * outlined pill styling above unmodified.
 */
function useCountBump(value: number | null): boolean {
  const [bumping, setBumping] = useState(false);
  const prevValueRef = useRef(value);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current && prevValueRef.current !== value) {
      setBumping(true);
      const timeout = setTimeout(() => setBumping(false), 220);
      prevValueRef.current = value;
      return () => clearTimeout(timeout);
    }
    prevValueRef.current = value;
    mountedRef.current = true;
  }, [value]);

  return bumping;
}
