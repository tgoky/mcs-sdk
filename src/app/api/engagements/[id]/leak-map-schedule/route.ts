// src/app/api/engagements/[id]/leak-map-schedule/route.ts
//
// Leak-Map's shape is genuinely different from the other three: it's
// cron-scheduled (weekly/monthly per-engagement), not booking-driven, so
// it doesn't touch booking_roster at all. The gap here isn't a frozen
// single-run view (each Leak-Map run already = one complete audit,
// LeakMapDetail.audit is singular) — it's that there's no way to see audit
// history across time, or when the next audit is actually coming, without
// opening runs one at a time. auditRunsLog is already engagement-scoped;
// this aggregates it and adds the one thing that's never existed anywhere:
// the actual next-scheduled-audit date, computed via the same
// nextWeeklyOccurrence/nextMonthlyOccurrence logic the real cron uses (see
// schedule-matcher.ts) so it can't drift from when the audit will really
// fire.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, auditRunsLog, activeAlerts } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, desc } from "drizzle-orm";
import { nextWeeklyOccurrence, nextMonthlyOccurrence } from "@/features/leak-map/server/schedule-matcher";
import type { EngagementStack } from "@/models/schema";
import type { TopIssue } from "@/app/dashboard/runs/[id]/_shared/types";

export const runtime = "nodejs";
export const revalidate = 0;

export interface AuditHistoryItem {
  id: string;
  runType: string;
  runId: string | null;
  createdAt: string;
  overallSeverity: "high" | "medium" | "low" | "none";
  topIssueCount: number;
  alertsFiredCount: number;
  gapsCount: number;
}

export interface ScheduledAudit {
  auditType: "weekly" | "monthly";
  nextRunAt: string;
  timezone: string;
}

export interface ActiveAlertItem {
  id: string;
  metricName: string;
  severity: string;
  threshold: string;
  comparison: string;
  lastFiredAt: string | null;
}

function severityRank(s: string) {
  return { high: 3, medium: 2, low: 1, none: 0 }[s] ?? 0;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const stack = tenant.stack as EngagementStack | null;
    const now = new Date();

    const scheduled: ScheduledAudit[] = [
      {
        auditType: "weekly",
        nextRunAt: nextWeeklyOccurrence(stack?.weekly_summary_schedule, now).toISOString(),
        timezone: stack?.weekly_summary_schedule?.timezone ?? "UTC",
      },
      {
        auditType: "monthly",
        nextRunAt: nextMonthlyOccurrence(stack?.monthly_deep_dive_schedule, now).toISOString(),
        timezone: stack?.monthly_deep_dive_schedule?.timezone ?? "UTC",
      },
    ];

    const [audits, alerts] = await Promise.all([
      db
        .select()
        .from(auditRunsLog)
        .where(eq(auditRunsLog.engagementId, engagementId))
        .orderBy(desc(auditRunsLog.createdAt))
        .limit(100),
      db.select().from(activeAlerts).where(eq(activeAlerts.engagementId, engagementId)),
    ]);

    const history: AuditHistoryItem[] = audits.map((a) => {
      const issues = (a.topIssues as TopIssue[] | null) ?? [];
      const sorted = [...issues].sort((x, y) => severityRank(y.severity) - severityRank(x.severity));
      return {
        id: a.id,
        runType: a.runType,
        runId: a.runId,
        createdAt: a.createdAt.toISOString(),
        overallSeverity: sorted[0]?.severity ?? "none",
        topIssueCount: issues.length,
        alertsFiredCount: ((a.alertsFired as string[] | null) ?? []).length,
        gapsCount: ((a.gaps as string[] | null) ?? []).length,
      };
    });

    const alertItems: ActiveAlertItem[] = alerts.map((a) => ({
      id: a.id,
      metricName: a.metricName,
      severity: a.severity,
      threshold: a.threshold,
      comparison: a.comparison,
      lastFiredAt: a.lastFiredAt ? a.lastFiredAt.toISOString() : null,
    }));

    return NextResponse.json({ history, scheduled, alerts: alertItems });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
