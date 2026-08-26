// src/lib/win-back-touch-schedule.ts
//
// Extracted from src/app/api/engagements/[id]/win-back-pipeline/route.ts
// (2026-08-24) — the "earliest not-yet-sent touch's scheduled date" math,
// shared now with the cross-client Upcoming aggregation
// (src/lib/upcoming-touches.ts) so both compute "next touch" identically
// instead of a second copy drifting out of sync.

export interface WinBackAssetMap {
  emails: Array<{ id: string; offsetDays: number }>;
  sms: Array<{ id: string; offsetDays: number }>;
}

export interface TouchScheduleEntry {
  id: string;
  offsetDays: number;
}

/** Merges emails+sms into one offset-sorted touch schedule keyed by the
 * same messageId sequenceMessageLog rows use. */
export function buildTouchSchedule(assetMap: WinBackAssetMap | null): TouchScheduleEntry[] {
  if (!assetMap) return [];
  return [...assetMap.emails.map((e) => ({ id: e.id, offsetDays: e.offsetDays })), ...assetMap.sms.map((s) => ({ id: s.id, offsetDays: s.offsetDays }))].sort(
    (a, b) => a.offsetDays - b.offsetDays
  );
}

/** Earliest not-yet-sent touchpoint's scheduled date — null once every
 * touch in the schedule has a matching "sent" row, the enrollment has
 * exited, or there's no schedule to work from. */
export function computeNextTouchAt(
  status: string,
  enrolledAt: Date,
  touchSchedule: TouchScheduleEntry[],
  sentMessageIds: Set<string>
): string | null {
  if (status !== "active") return null;
  const next = touchSchedule.find((t) => !sentMessageIds.has(t.id));
  if (!next) return null;
  const d = new Date(enrolledAt);
  d.setDate(d.getDate() + next.offsetDays);
  return d.toISOString();
}

export interface TouchOccurrence {
  messageId: string;
  scheduledAt: string;
}

/**
 * Every remaining (not yet sent) touch's scheduled date for an active
 * enrollment — the full future cadence, not just the immediate next one
 * computeNextTouchAt returns. Added for the cross-client Calendar view
 * (2026-08-25), which needs to plot a touch on whichever specific day it
 * falls within a browsed month, not just surface "what's next from now"
 * the way the Upcoming digest does. Each remaining touch's date is
 * deterministic (enrolledAt + offsetDays) regardless of send status, so
 * this doesn't need to guess at anything computeNextTouchAt doesn't
 * already establish — it's the same math, just not stopping at the first
 * unsent entry.
 */
export function computeRemainingTouches(
  status: string,
  enrolledAt: Date,
  touchSchedule: TouchScheduleEntry[],
  sentMessageIds: Set<string>
): TouchOccurrence[] {
  if (status !== "active") return [];
  return touchSchedule
    .filter((t) => !sentMessageIds.has(t.id))
    .map((t) => {
      const d = new Date(enrolledAt);
      d.setDate(d.getDate() + t.offsetDays);
      return { messageId: t.id, scheduledAt: d.toISOString() };
    });
}
