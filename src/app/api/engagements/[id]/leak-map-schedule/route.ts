import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, auditRunsLog, activeAlerts } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
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

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
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