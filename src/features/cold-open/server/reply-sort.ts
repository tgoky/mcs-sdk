// src/features/cold-open/server/reply-sort.ts
//
// Reply Sort: polls the connected ESP's reply feed, classifies each new
// reply, and persists it. Port of the Cold Open skill pack's
// reply_sort.py, scoped to the reply feeds actually implemented (see
// replies/base.ts's header) — Instantly today.
//
// Routing note: `routedToQueue` on coldOpenReplies is real, queryable
// data (set true for interested/objection/unclassified — the dispositions
// that cost a deal if missed) but this pass does not wire a new branch
// into src/lib/queue.ts's own item derivation, which already spans
// several source tables — that integration is real, separately-scoped
// follow-up work, not guessed at here. The Run History / send-report
// view already surfaces these rows today.

import { db } from "@/lib/db";
import { coldOpenReplies, type ColdOpenReplyDisposition } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { getColdOpenConfig } from "./config";
import { preconditionCheck } from "./config";
import { InstantlyReplyFetcher } from "./replies/instantly";
import { classifyReply, DEFAULT_TAXONOMY } from "./reply-classifier";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const QUEUE_WORTHY: ColdOpenReplyDisposition[] = ["interested", "objection", "unclassified"];

export async function runReplySort(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const gate = await (step ? step.run("precondition-check", () => preconditionCheck(engagementId, "reply-sort")) : preconditionCheck(engagementId, "reply-sort"));
    if (gate.length > 0) {
      await logStep(runId, { phase: "reply_sort_precondition", status: "skipped", detail: gate.join("; ") });
      summary.openItems.push(...gate);
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));
    if (!config?.sendPlatform) throw new Error("No sending platform configured.");

    summary.whatWasAttempted.push(`Polling the ${config.sendPlatform.platform} reply feed.`);

    if (config.sendPlatform.platform !== "instantly") {
      await logStep(runId, {
        phase: "reply_fetch",
        status: "skipped",
        detail: `Reply feed for ${config.sendPlatform.platform} is not yet built — Instantly is the only supported feed today.`,
      });
      summary.openItems.push(`Reply feed for ${config.sendPlatform.platform} is real, separately-scoped follow-up work.`);
      await finishRun(runId, { summary });
      return;
    }

    const fetcher = new InstantlyReplyFetcher(engagementId, { baseUrl: config.sendPlatform.baseUrl });
    const replies = await fetcher.fetchReplies(100);
    await logStep(runId, { phase: "reply_fetch", status: "success", detail: `Fetched ${replies.length} recent repl${replies.length === 1 ? "y" : "ies"} from the feed.` });

    let classified = 0;
    let skippedDuplicate = 0;
    const byDisposition: Partial<Record<ColdOpenReplyDisposition, number>> = {};

    for (const reply of replies) {
      const [existing] = await db
        .select({ id: coldOpenReplies.id })
        .from(coldOpenReplies)
        .where(and(eq(coldOpenReplies.engagementId, engagementId), eq(coldOpenReplies.externalReplyId, reply.replyId)))
        .limit(1);
      if (existing) {
        skippedDuplicate++;
        continue;
      }

      const result = await classifyReply({ subject: reply.subject, bodyText: reply.bodyText }, config.productIdentity, DEFAULT_TAXONOMY);
      await db.insert(coldOpenReplies).values({
        engagementId,
        leadEmail: reply.leadEmail,
        campaignId: reply.campaignId || null,
        externalReplyId: reply.replyId,
        disposition: result.disposition,
        classificationSource:
          result.method === "heuristic" ? "heuristic" : result.method === "empty_body" ? "none" : result.method === "error" ? "error" : "model",
        rawBody: reply.bodyText,
        routedToQueue: QUEUE_WORTHY.includes(result.disposition),
      });
      classified++;
      byDisposition[result.disposition] = (byDisposition[result.disposition] ?? 0) + 1;
    }

    await logStep(runId, {
      phase: "reply_classify",
      status: "success",
      detail: `Classified ${classified} new repl${classified === 1 ? "y" : "ies"} (${skippedDuplicate} already on file). Breakdown: ${JSON.stringify(byDisposition)}`,
    });
    summary.whatWorked.push(`${classified} reply(ies) classified this run.`);
    const queueWorthy = QUEUE_WORTHY.reduce((sum, d) => sum + (byDisposition[d] ?? 0), 0);
    if (queueWorthy > 0) summary.openItems.push(`${queueWorthy} reply(ies) need human eyes (interested/objection/unclassified).`);

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
