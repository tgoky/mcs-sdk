// src/lib/dashboard-stats.ts
//
// Small, dependency-free aggregation helpers for the dashboard overview
// stats. Split out of src/app/dashboard/page.tsx so the date-math and the
// "what counts as an issue" logic can be reasoned about (and reused) on
// their own, instead of living inline in a server component.

import type { QueueItem } from "@/lib/queue";

/**
 * Monday 00:00:00 (server-local time) of the week containing `reference`.
 * Sunday is treated as the last day of the week, not the first — matches
 * the Mon–Sun week the calendar views elsewhere in this app (see
 * _shared/calendar-grid.ts's ["Mon", "Tue", ...] header) already use.
 */
export function startOfWeek(reference: Date): Date {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

/** This week's Monday, and the same weekday-aligned window one week earlier — for a like-for-like trend comparison. */
export function getWeekWindows(reference: Date = new Date()): {
  thisWeekStart: Date;
  lastWeekStart: Date;
  lastWeekEnd: Date;
} {
  const thisWeekStart = startOfWeek(reference);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  return { thisWeekStart, lastWeekStart, lastWeekEnd: thisWeekStart };
}

/**
 * Percent change from `previous` to `current`, formatted for display.
 * Returns null when there's no meaningful baseline to compare against
 * (both weeks empty) — the UI falls back to a plain "no change yet"
 * label in that case instead of a misleading "+0%" or a divide-by-zero
 * "+Infinity%".
 */
export function weeklyTrendLabel(current: number, previous: number): string | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return `+${current} vs last week (0 then)`;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "flat vs last week";
  return `${pct > 0 ? "+" : ""}${pct}% vs last week`;
}

const ISSUE_CATEGORIES = new Set<QueueItem["category"]>(["approve", "action_needed", "alert"]);

/**
 * The dashboard's "Issues" stat used to count rows in `active_alerts` with
 * severity="critical" — but that table only holds Leak-Map alert-rule
 * *definitions* (threshold configs), not things currently wrong. An
 * engagement with zero Leak-Map alert packs configured — the common case —
 * always read 0 there, regardless of failing runs, invalid credentials, or
 * pending approvals sitting untouched.
 *
 * getQueueItems() (src/lib/queue.ts) is the app's existing, already-correct
 * merge of pending_actions + human_blockers + notifications + live
 * run-failure classification. Every item there except "fyi" represents
 * something a human genuinely needs to act on — approvals awaiting a
 * decision, blockers a run is durably paused on, and critical/warning
 * alerts (including credential-health failures, see
 * features/notifications/server/credential-health.ts). Reusing it here
 * means this count can never drift from what the Queue page and sidebar
 * badge already show, and needs zero new queries since the dashboard was
 * already fetching queueItems for the Queue panel.
 */
export function summarizeIssues(items: QueueItem[]): {
  count: number;
  breakdown: string | null;
} {
  const actionable = items.filter((i) => ISSUE_CATEGORIES.has(i.category));
  if (actionable.length === 0) return { count: 0, breakdown: null };

  const approve = actionable.filter((i) => i.category === "approve").length;
  const actionNeeded = actionable.filter((i) => i.category === "action_needed").length;
  const alert = actionable.filter((i) => i.category === "alert").length;

  const parts: string[] = [];
  if (approve > 0) parts.push(`${approve} need${approve === 1 ? "s" : ""} approval`);
  if (actionNeeded > 0) parts.push(`${actionNeeded} need${actionNeeded === 1 ? "s" : ""} action`);
  if (alert > 0) parts.push(`${alert} alert${alert === 1 ? "" : "s"}`);

  return { count: actionable.length, breakdown: parts.join(" · ") };
}
