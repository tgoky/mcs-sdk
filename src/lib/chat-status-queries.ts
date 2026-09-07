// src/lib/chat-status-queries.ts
//
// The "it's an assistant, not a run-once chat" capability — read-only
// status lookups so the model can answer "what's on today," "who
// cancelled," "how'd that last run go," "is anyone in an active
// recovery" without triggering anything. No side effects anywhere in
// this file on purpose: every function here is a plain SELECT, so
// there's no risk class to reason about the way there was for
// create_client or the credential-linking functions — worth building
// first, and worth keeping that way going forward.

import { db } from "@/lib/db";
import { bookingRoster, skillRuns, winBackEnrollments, engagements, auditRunsLog } from "@/models/schema";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { getBenchmarkLines } from "@/features/leak-map/server/leak-map-benchmarks";

/**
 * Security audit fix (post-Phase-9): every function below used to take
 * only an `engagementId` sourced straight from the chat model's tool-call
 * input, with no check that the id actually belonged to the requesting
 * user's workspace — the same shape of gap chat-skill-trigger.ts's
 * triggerChatSkillForEngagement already closes for every mutating tool.
 * A user could get the model to echo back another workspace's
 * engagementId (or supply one directly) and read that client's booking
 * roster, run history/error messages, or active win-back prospects. Every
 * function here now takes `workspaceId` and verifies ownership first —
 * same "Client not found"-shaped denial regardless of whether the id is
 * bogus or just not this workspace's, so a failed lookup doesn't itself
 * leak which case it was.
 */
async function verifyEngagementInWorkspace(engagementId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}

export async function getTodaysCalls(engagementId: string, workspaceId: string) {
  if (!(await verifyEngagementInWorkspace(engagementId, workspaceId))) return [];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      prospectName: bookingRoster.prospectName,
      prospectEmail: bookingRoster.prospectEmail,
      callTime: bookingRoster.callTime,
      status: bookingRoster.status,
    })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), gte(bookingRoster.callTime, startOfDay), lte(bookingRoster.callTime, endOfDay)))
    .orderBy(bookingRoster.callTime);

  return rows;
}

export async function getRecentCancellations(engagementId: string, workspaceId: string, sinceDays = 7) {
  if (!(await verifyEngagementInWorkspace(engagementId, workspaceId))) return [];

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const rows = await db
    .select({
      prospectName: bookingRoster.prospectName,
      prospectEmail: bookingRoster.prospectEmail,
      callTime: bookingRoster.callTime,
      updatedAt: bookingRoster.updatedAt,
    })
    .from(bookingRoster)
    .where(and(eq(bookingRoster.engagementId, engagementId), eq(bookingRoster.status, "cancelled"), gte(bookingRoster.updatedAt, since)))
    .orderBy(desc(bookingRoster.updatedAt))
    .limit(20);

  return rows;
}

export async function getRunHistory(engagementId: string, workspaceId: string, skillName?: string) {
  if (!(await verifyEngagementInWorkspace(engagementId, workspaceId))) return [];

  const rows = await db
    .select({
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      startedAt: skillRuns.startedAt,
      completedAt: skillRuns.completedAt,
      errorMessage: skillRuns.errorMessage,
    })
    .from(skillRuns)
    .where(skillName ? and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, skillName)) : eq(skillRuns.engagementId, engagementId))
    .orderBy(desc(skillRuns.startedAt))
    .limit(10);

  return rows;
}

/**
 * Leak Map benchmark comparison, on demand. Deliberately NOT a fresh
 * audit or a new LLM call — getBenchmarkLines (leak-map-benchmarks.ts) is
 * a plain, k-anonymized DB read against metricsBenchmark, already the
 * exact function the real weekly/monthly audit calls to add benchmark
 * lines to its own report. This just re-runs that same read against the
 * client's most recent audit's own metrics, standalone, so a benchmark
 * check doesn't require waiting for (or forcing) a new audit run.
 *
 * Verified NOT to extend to a single-URL/page audit — audit-engine.ts's
 * whole pipeline (AuditEngine.runAuditPipeline) pulls account-wide
 * booking/CRM metrics over a lookback window, not page content; there is
 * no parameter anywhere in it for a specific URL. That's a structurally
 * different kind of tool (more like Pin-Down's page audit) and isn't
 * something this function — or any real extension of Leak Map's actual
 * pipeline — can honestly claim to do.
 */
export async function getLeakMapBenchmarkComparison(engagementId: string, workspaceId: string): Promise<{ lines: string[]; auditedAt: Date } | { error: string }> {
  const [engagement] = await db
    .select({ offerDetails: engagements.offerDetails })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  if (!engagement) return { error: "Client not found." };

  const [latestAudit] = await db
    .select({ topIssues: auditRunsLog.topIssues, createdAt: auditRunsLog.createdAt })
    .from(auditRunsLog)
    .where(eq(auditRunsLog.engagementId, engagementId))
    .orderBy(desc(auditRunsLog.createdAt))
    .limit(1);
  // auditRunsLog.topIssues is untyped jsonb at the schema level (same
  // looseness computeAndPersistBenchmarks's own `row.top_issues` cast
  // already works around) — TopIssue is this column's real, documented
  // shape (see _shared/types.ts's AuditRow), just not encoded in the
  // column definition itself.
  const topIssues = latestAudit?.topIssues as Array<{ name: string; current: number; insufficientData?: boolean }> | null | undefined;
  if (!topIssues || topIssues.length === 0) {
    return { error: "No Leak Map audit on file yet for this client — run Leak Map at least once first, then benchmarks can compare against it." };
  }

  const metrics = topIssues.map((issue) => ({ name: issue.name, current: issue.current, insufficientData: issue.insufficientData ?? false }));
  const lines = await getBenchmarkLines(engagement.offerDetails, metrics);
  if (lines.length === 0) {
    return {
      error:
        "No benchmark data available for this client's bucket yet (needs traffic_temperature + price + vertical all set, and at least 20 other engagements in the same bucket) — nothing to compare against right now.",
    };
  }
  return { lines, auditedAt: latestAudit.createdAt };
}

export async function getActiveRecoveries(engagementId: string, workspaceId: string) {
  if (!(await verifyEngagementInWorkspace(engagementId, workspaceId))) return [];

  const rows = await db
    .select({
      prospectName: winBackEnrollments.prospectName,
      prospectEmail: winBackEnrollments.prospectEmail,
      enrolledAt: winBackEnrollments.enrolledAt,
      recoveryWindowDays: winBackEnrollments.recoveryWindowDays,
    })
    .from(winBackEnrollments)
    .where(and(eq(winBackEnrollments.engagementId, engagementId), eq(winBackEnrollments.status, "active")))
    .orderBy(desc(winBackEnrollments.enrolledAt));

  return rows;
}
