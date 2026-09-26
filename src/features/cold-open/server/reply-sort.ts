// src/features/cold-open/server/reply-sort.ts
//
// Reply Sort: polls the connected ESP's reply feed, classifies each new
// reply, and persists it. Port of the Cold Open skill pack's
// reply_sort.py, scoped to the reply feeds actually implemented (see
// replies/base.ts's header) — Instantly today.
//
// Routing note: `routedToQueue` on coldOpenReplies is real, queryable
// data (set true for interested/objection/unclassified — the dispositions
// that cost a deal if missed), and src/lib/queue.ts now reads it as a real
// 4th source (coldOpenReplyQueueItems) alongside pending_actions/
// human_blockers/notifications — a queue-worthy reply actually reaches a
// human in the Queue panel now, not just the Run History / findings view.
// getColdOpenReplyEngagementId/resolveColdOpenReplyQueueItem below are
// this table's counterpart to human-blockers.ts's getBlockerEngagementId/
// resolveBlocker, used by the resolve route the Queue panel calls once a
// reviewer has actually dealt with one.

import { db } from "@/lib/db";
import { coldOpenReplies, type ColdOpenReplyDisposition } from "@/models/schema";
import { eq, and, isNull } from "drizzle-orm";
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
      // Only Instantly has a reply feed to poll. The other tools send each
      // reply to this app as it arrives (api/webhooks/cold-open-replies).
      await logStep(runId, {
        phase: "reply_fetch",
        status: "skipped",
        detail: `${config.sendPlatform.platform} sends replies to this app by webhook as they arrive; there's no feed to poll.`,
      });
      summary.openItems.push(`Replies from ${config.sendPlatform.platform} arrive by webhook. If none have come in, check the reply webhook address is set in ${config.sendPlatform.platform} (Cold Open setup shows it).`);
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
      const stored = await storeColdOpenReply(engagementId, reply, config.productIdentity);
      if (stored.status === "duplicate") {
        skippedDuplicate++;
        continue;
      }
      classified++;
      byDisposition[stored.disposition] = (byDisposition[stored.disposition] ?? 0) + 1;
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

/**
 * Sorts and stores one reply, whichever way it arrived (this poller, or a
 * sending tool's webhook: api/webhooks/cold-open-replies). A reply already
 * on file (same external id) is left alone, so a re-poll or a retried
 * webhook never sorts or routes it twice.
 */
export async function storeColdOpenReply(
  engagementId: string,
  reply: { leadEmail: string; campaignId?: string | null; replyId: string; subject?: string; bodyText: string },
  productIdentity?: { name?: string; valueProp?: string } | null
): Promise<{ status: "stored"; id: string; disposition: ColdOpenReplyDisposition } | { status: "duplicate" }> {
  const [existing] = await db
    .select({ id: coldOpenReplies.id })
    .from(coldOpenReplies)
    .where(and(eq(coldOpenReplies.engagementId, engagementId), eq(coldOpenReplies.externalReplyId, reply.replyId)))
    .limit(1);
  if (existing) return { status: "duplicate" };

  const result = await classifyReply({ subject: reply.subject, bodyText: reply.bodyText }, productIdentity, DEFAULT_TAXONOMY, { engagementId });
  // onConflictDoNothing against the unique index on (engagementId,
  // externalReplyId): the check above has no lock, so two overlapping
  // deliveries can both pass it; the loser quietly loses the race.
  const [inserted] = await db
    .insert(coldOpenReplies)
    .values({
      engagementId,
      leadEmail: reply.leadEmail,
      campaignId: reply.campaignId || null,
      externalReplyId: reply.replyId,
      disposition: result.disposition,
      classificationSource:
        result.method === "heuristic" ? "heuristic" : result.method === "empty_body" ? "none" : result.method === "error" ? "error" : "model",
      rawBody: reply.bodyText,
      routedToQueue: QUEUE_WORTHY.includes(result.disposition),
    })
    .onConflictDoNothing()
    .returning({ id: coldOpenReplies.id });
  if (!inserted) return { status: "duplicate" };
  return { status: "stored", id: inserted.id, disposition: result.disposition };
}

/** Same shape as human-blockers.ts's getBlockerEngagementId — the resolve
 * route needs the owning engagement before it can check the caller's
 * access to it. */
export async function getColdOpenReplyEngagementId(replyId: string): Promise<string | null> {
  const [row] = await db.select({ engagementId: coldOpenReplies.engagementId }).from(coldOpenReplies).where(eq(coldOpenReplies.id, replyId)).limit(1);
  return row?.engagementId ?? null;
}

/** Marks a queue-worthy reply as handled. Only ever acts on a row that's
 * still routedToQueue with no queueResolvedAt yet — an already-resolved
 * reply (or one that was never queue-worthy) is left alone rather than
 * silently "resolving" something that was never outstanding. */
export async function resolveColdOpenReplyQueueItem(replyId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: coldOpenReplies.id })
    .from(coldOpenReplies)
    .where(and(eq(coldOpenReplies.id, replyId), eq(coldOpenReplies.routedToQueue, true), isNull(coldOpenReplies.queueResolvedAt)))
    .limit(1);
  if (!existing) return false;

  await db.update(coldOpenReplies).set({ queueResolvedAt: new Date() }).where(eq(coldOpenReplies.id, replyId));
  return true;
}
