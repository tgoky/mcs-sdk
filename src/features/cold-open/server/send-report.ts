// src/features/cold-open/server/send-report.ts
//
// Send Report: rolls up send volume, push outcomes, and reply
// dispositions since the last run into one summary. Scoped-down v1 of the
// Cold Open skill pack's send_report.py — a single rolling window over
// coldOpenLeads/coldOpenReplies rather than the source module's separate
// weekly-summary/monthly-deep-dive cadences (those are real, separately-
// scoped follow-up work once there's usage volume to make the distinction
// worth having).

import { db } from "@/lib/db";
import { coldOpenLeads, coldOpenReplies } from "@/models/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { getColdOpenConfig, preconditionCheck } from "./config";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const REPORT_WINDOW_DAYS = 7;

export async function runSendReport(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const gate = await (step ? step.run("precondition-check", () => preconditionCheck(engagementId, "send-report")) : preconditionCheck(engagementId, "send-report"));
    if (gate.length > 0) {
      await logStep(runId, { phase: "send_report_precondition", status: "skipped", detail: gate.join("; ") });
      summary.openItems.push(...gate);
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const config = await getColdOpenConfig(engagementId);
    const since = new Date(Date.now() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const leadRows = await db
      .select({ status: coldOpenLeads.status, count: sql<number>`count(*)::int` })
      .from(coldOpenLeads)
      .where(and(eq(coldOpenLeads.engagementId, engagementId), gte(coldOpenLeads.createdAt, since)))
      .groupBy(coldOpenLeads.status);

    const replyRows = await db
      .select({ disposition: coldOpenReplies.disposition, count: sql<number>`count(*)::int` })
      .from(coldOpenReplies)
      .where(and(eq(coldOpenReplies.engagementId, engagementId), gte(coldOpenReplies.classifiedAt, since)))
      .groupBy(coldOpenReplies.disposition);

    const leadsByStatus = Object.fromEntries(leadRows.map((r) => [r.status, r.count]));
    const repliesByDisposition = Object.fromEntries(replyRows.map((r) => [r.disposition, r.count]));
    const totalPushed = leadsByStatus["pushed"] ?? 0;
    const totalReplies = replyRows.reduce((sum, r) => sum + r.count, 0);

    await logStep(runId, {
      phase: "send_report_rollup",
      status: "success",
      detail: `${REPORT_WINDOW_DAYS}-day window: ${totalPushed} pushed, ${totalReplies} replies. Leads by status: ${JSON.stringify(leadsByStatus)}. Replies by disposition: ${JSON.stringify(repliesByDisposition)}`,
    });

    summary.whatWasAttempted.push(`Rolled up the last ${REPORT_WINDOW_DAYS} days of send and reply activity.`);
    summary.whatWorked.push(`${totalPushed} lead(s) pushed for ${config?.productIdentity?.name ?? "this client"}; ${totalReplies} repl${totalReplies === 1 ? "y" : "ies"} received.`);
    if (totalPushed === 0) {
      summary.openItems.push("No leads pushed in this window — check that Daily Send is enabled and lead sources have fresh leads.");
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
