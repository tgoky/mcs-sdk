// src/features/reputation-manager/server/digest.ts
//
// thresholds.yml.template's real_time_alert_gate: "Real-time alerts trigger
// constantly in the first 30 days if every threshold pings... Real-time
// gates to score 75+ only; everything else batches into the daily digest,
// which you review once daily in a batched session." Everything below
// REP_THRESHOLD_DEFAULTS.realTimeAlertFloor never gets an immediate push
// today — it's logged (repAuditEvents "detection" rows, every scored
// mention whether flagged or not) and then nothing else happens to it. This
// is the "nothing else" — a once-daily rollup of what happened since the
// last digest, delivered as a single low-severity notification instead of
// the OG spec's twice-daily local-time cadence (see repDigestCron in
// src/inngest/reputation-manager.ts for why once-daily, UTC-fixed, matches
// this product's existing rep-* cron cadence rather than inventing a new
// per-timezone mechanism for one skill).
import { db } from "@/lib/db";
import { repAuditEvents, repIncidents, skillRuns, repIdentityGraphs } from "@/models/schema";
import { and, eq, gt, desc } from "drizzle-orm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { notifyUser } from "@/lib/notify";
import { logAuditEvent, type DetectionPayload } from "@/features/reputation-manager/server/audit-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

async function lastSuccessfulDigestAt(engagementId: string): Promise<Date | null> {
  const [row] = await db
    .select({ completedAt: skillRuns.completedAt })
    .from(skillRuns)
    .where(and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, "rep-digest"), eq(skillRuns.status, "success")))
    .orderBy(desc(skillRuns.completedAt))
    .limit(1);
  return row?.completedAt ?? null;
}

export interface RepDigestSummary {
  // ISO string, not Date — this struct is the return value of a step.run
  // call (run("build-digest", ...) below), and Inngest's step output is
  // JSON-serialized between the step and the caller: a Date field comes
  // back as a plain string, not a rehydrated Date. Only ever used for a
  // truthy check in formatDigestBody, so a string works exactly as well.
  since: string | null;
  detectionsBySource: Record<string, number>;
  flaggedCount: number;
  incidentsDeclared: number;
  totalEvents: number;
}

async function buildRepDigest(engagementId: string, since: Date | null): Promise<RepDigestSummary> {
  const detectionRows = await db
    .select({ payload: repAuditEvents.payload })
    .from(repAuditEvents)
    .where(
      since
        ? and(eq(repAuditEvents.engagementId, engagementId), eq(repAuditEvents.eventType, "detection"), gt(repAuditEvents.createdAt, since))
        : and(eq(repAuditEvents.engagementId, engagementId), eq(repAuditEvents.eventType, "detection"))
    );

  const detectionsBySource: Record<string, number> = {};
  let flaggedCount = 0;
  for (const row of detectionRows) {
    const payload = row.payload as unknown as DetectionPayload;
    detectionsBySource[payload.source] = (detectionsBySource[payload.source] ?? 0) + 1;
    // "Flagged" isn't its own field on DetectionPayload — a detection this
    // digest should call out is one whose threat_score cleared the
    // real-time floor's own reasoning at a smaller scale: worth a mention
    // even though it never crossed the incident/real-time thresholds.
    if (typeof payload.threatScore === "number" && payload.threatScore >= 30) flaggedCount++;
  }

  const incidentRows = since
    ? await db.select({ id: repIncidents.id }).from(repIncidents).where(and(eq(repIncidents.engagementId, engagementId), gt(repIncidents.declaredAt, since)))
    : await db.select({ id: repIncidents.id }).from(repIncidents).where(eq(repIncidents.engagementId, engagementId));

  return {
    since: since ? since.toISOString() : null,
    detectionsBySource,
    flaggedCount,
    incidentsDeclared: incidentRows.length,
    totalEvents: detectionRows.length,
  };
}

function formatDigestBody(digest: RepDigestSummary, operatorName: string): string {
  if (digest.totalEvents === 0 && digest.incidentsDeclared === 0) {
    return `Quiet ${digest.since ? "day" : "period"} — nothing new to report for ${operatorName}.`;
  }
  const bySourceLines = Object.entries(digest.detectionsBySource)
    .map(([source, count]) => `${count} on ${source}`)
    .join(", ");
  const parts = [
    digest.totalEvents > 0 ? `${digest.totalEvents} mention(s) checked (${bySourceLines})` : null,
    digest.flaggedCount > 0 ? `${digest.flaggedCount} worth a look but below the real-time floor` : null,
    digest.incidentsDeclared > 0 ? `${digest.incidentsDeclared} incident(s) declared (already paged separately)` : null,
  ].filter((p): p is string => p !== null);
  return `${operatorName}: ${parts.join(". ")}.`;
}

export async function runRepDigest(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const graph = await run("load-identity-graph", async () => {
      const [row] = await db.select({ operatorName: repIdentityGraphs.operatorName }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
      return row ?? null;
    });

    if (!graph) {
      await logStep(runId, { phase: "rep_digest", status: "skipped", detail: "No identity graph yet." });
      summary.openItems.push("Nothing to digest until the identity graph exists.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const sinceRaw = await run("find-last-digest", () => lastSuccessfulDigestAt(engagementId));
    const since = sinceRaw ? new Date(sinceRaw) : null;

    const digest = await run("build-digest", () => buildRepDigest(engagementId, since));

    const body = formatDigestBody(digest, graph.operatorName);

    await run("notify-and-log", async () => {
      await notifyUser({
        whopUserId: tenant.whopUserId,
        engagementId,
        runId,
        type: "reputation_daily_digest",
        severity: "info",
        title: `Daily digest — ${graph.operatorName}`,
        body,
        slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
      });

      await logAuditEvent(engagementId, {
        eventType: "reflection",
        payload: { reportPath: `digest:${runId}`, period: "daily", eventsReviewed: digest.totalEvents },
      });
    });

    await logStep(runId, { phase: "rep_digest", status: "success", detail: body });
    summary.whatWorked.push(body);
    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
