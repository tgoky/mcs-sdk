// src/lib/roster-status.ts
//
// Extracted from src/app/api/engagements/[id]/roster/route.ts (2026-08-24)
// so the cross-client Calendar aggregation (src/lib/calendar-roster.ts) can
// derive a booking's lifecycle status the exact same way the per-engagement
// roster already does, instead of a second copy of this logic drifting out
// of sync with it over time.

export type RosterStatus = "scheduled" | "brief_delivered" | "brief_failed" | "cancelled";

export function deriveRosterStatus(row: {
  bookingStatus: string;
  researchStatus: string | null;
  aiSynthesisStatus: string | null;
  briefDeliveredAt: Date | null;
}): RosterStatus {
  if (row.bookingStatus === "cancelled") return "cancelled";
  if (row.briefDeliveredAt) return "brief_delivered";
  if (row.researchStatus === "failed" || row.aiSynthesisStatus === "failed") return "brief_failed";
  return "scheduled";
}
