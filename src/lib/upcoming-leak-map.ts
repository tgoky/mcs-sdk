// src/lib/upcoming-leak-map.ts
//
// The "next Leak Map" layer for /dashboard/upcoming — the last piece of
// what was originally asked for that page ("next brief, next appointment,
// next booking recovery, what's in the cadence, next leak maps"), added
// to complete it rather than leaving it as a stated-but-unbuilt gap.
//
// Reuses the exact same pure schedule-matching functions the per-engagement
// leak-map-schedule route already uses (src/features/leak-map/server/
// schedule-matcher.ts) — no new scheduling logic, just evaluated across
// every client's own stack.weekly_summary_schedule/monthly_deep_dive_schedule
// instead of one.
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { nextWeeklyOccurrence, nextMonthlyOccurrence } from "@/features/leak-map/server/schedule-matcher";

export interface UpcomingLeakMapAudit {
  engagementId: string;
  buyer: string;
  auditType: "weekly" | "monthly";
  nextRunAt: string;
  timezone: string;
}

/** Every client's next Leak Map audit (whichever of weekly/monthly comes
 * first), soonest first. */
export async function getUpcomingLeakMapAudits(whopUserId: string, workspaceId: string): Promise<UpcomingLeakMapAudit[]> {
  const rows = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)));

  const now = new Date();

  const audits: UpcomingLeakMapAudit[] = rows.map((r) => {
    const stack = r.stack as EngagementStack | null;
    const weekly = nextWeeklyOccurrence(stack?.weekly_summary_schedule, now);
    const monthly = nextMonthlyOccurrence(stack?.monthly_deep_dive_schedule, now);
    const isWeeklySooner = weekly.getTime() <= monthly.getTime();
    const chosen = isWeeklySooner ? weekly : monthly;
    return {
      engagementId: r.engagementId,
      buyer: r.buyer,
      auditType: isWeeklySooner ? "weekly" : "monthly",
      nextRunAt: chosen.toISOString(),
      timezone: (isWeeklySooner ? stack?.weekly_summary_schedule?.timezone : stack?.monthly_deep_dive_schedule?.timezone) ?? "UTC",
    };
  });

  return audits.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}
