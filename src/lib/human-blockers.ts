// src/lib/human-blockers.ts
//
// Cross-cutting recovery gap 17 — human-only-blocker resume mechanism.
//
// The OG SKILL.md ran inside an agentic session where hitting a step that
// genuinely needed a human (record this video, wait for the A2P 10DLC
// campaign to clear carrier review, hire an editor, grant this credential)
// just meant the session paused and the human resumed it later by typing
// "continue" — the agent picked up exactly where it left off because the
// whole run lived in one conversation. UTP's server-side Inngest runs have
// no equivalent: today, a step that can't proceed either fails the run
// outright or (worse) silently no-ops and moves on.
//
// This restores that pause-and-resume behavior using Inngest's own
// step.waitForEvent() primitive — no custom polling loop, no separate
// "resume worker" cron. A blocked step calls waitForBlockerResolution(),
// which durably suspends that specific Inngest function invocation (not
// the whole process — Inngest checkpoints it) until either:
//   1. a human resolves the blocker (via POST /api/blockers/[id]/resolve,
//      which calls resolveBlocker() below), which sends the
//      human_blocker.resolved event and wakes the exact waiting step, or
//   2. the timeout elapses, in which case waitForEvent returns null and
//      the caller decides how to fail gracefully.
//
// Scope note: there is deliberately no automatic "abandon after 90 days"
// sweep in this pass. A blocker sitting open for months with no cron ever
// touching it is a correct, inert state — the run stays durably suspended
// (Inngest doesn't burn compute waiting) until a human either resolves or
// abandons it. Adding an auto-abandon sweep is a reasonable follow-up but
// is a product decision (what's the right default window? does it differ
// by blockerType?) rather than a mechanical gap-close, so it's left out
// rather than guessed at here.
import { db } from "@/lib/db";
import { humanBlockers, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { inngest, humanBlockerResolved } from "@/lib/inngest";
import { notifyUser } from "@/lib/notify";

export type BlockerType =
  | "video_recording"
  | "a2p_10dlc_approval"
  | "editor_hire"
  | "credential_grant"
  | "buyer_content_approval"
  | "other";

/**
 * Creates an open blocker row and notifies the operator through the same
 * channel notify.ts already uses for everything else (in-app always,
 * Slack if configured, email if configured) — a blocker is exactly the
 * kind of "something needs you, right now" event notify.ts exists for.
 * Does NOT itself pause anything; call waitForBlockerResolution from
 * inside the Inngest step that needs to actually suspend.
 */
export async function createBlocker(input: {
  engagementId: string;
  skillName: string;
  runId?: string;
  blockerType: BlockerType;
  description: string;
}): Promise<string> {
  const [row] = await db
    .insert(humanBlockers)
    .values({
      engagementId: input.engagementId,
      skillName: input.skillName,
      runId: input.runId,
      blockerType: input.blockerType,
      description: input.description,
    })
    .returning({ id: humanBlockers.id });

  const [engagement] = await db
    .select({ whopUserId: engagements.whopUserId, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, input.engagementId))
    .limit(1);

  if (engagement) {
    try {
      const stack = engagement.stack as EngagementStack;
      await notifyUser({
        whopUserId: engagement.whopUserId,
        engagementId: input.engagementId,
        type: "credential_check_error", // closest existing category — see notify.ts's NotificationType; this is an "action needed" class of alert like a credential problem, not a run failure
        severity: "warning",
        title: `${input.skillName}: action needed to continue`,
        body: input.description,
        slackWebhookUrl: stack?.slack_webhook_url,
      });
    } catch {
      // Never let a notification failure prevent the blocker itself from
      // being recorded — same isolation notify.ts's own doc comment
      // requires of every channel inside it.
    }
  }

  return row.id;
}

/**
 * Marks a blocker resolved and wakes any Inngest step durably waiting on
 * it. Idempotent-ish: resolving an already-resolved blocker is a no-op
 * (returns false) rather than double-sending the wake event, since Inngest
 * events are not deduplicated by the caller and a second send to a step
 * that already resumed would just be ignored anyway — but there's no
 * reason to emit it.
 */
export async function resolveBlocker(
  blockerId: string,
  resolvedBy: string,
  resumePayload?: Record<string, unknown>
): Promise<boolean> {
  const [existing] = await db.select().from(humanBlockers).where(eq(humanBlockers.id, blockerId)).limit(1);
  if (!existing || existing.status !== "open") return false;

  await db
    .update(humanBlockers)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy, resumePayload: resumePayload ?? null })
    .where(eq(humanBlockers.id, blockerId));

  await inngest.send(humanBlockerResolved.create({ blockerId, resumePayload }));
  return true;
}

/** Same shape as resolveBlocker but for the "never happening" case — no wake event, since nothing should be waiting forever on an abandoned blocker. */
export async function abandonBlocker(blockerId: string, resolvedBy: string): Promise<boolean> {
  const [existing] = await db.select().from(humanBlockers).where(eq(humanBlockers.id, blockerId)).limit(1);
  if (!existing || existing.status !== "open") return false;

  await db
    .update(humanBlockers)
    .set({ status: "abandoned", resolvedAt: new Date(), resolvedBy })
    .where(eq(humanBlockers.id, blockerId));
  return true;
}

/**
 * Call from inside an Inngest step function. Durably suspends this
 * invocation until resolveBlocker() sends the wake event for this exact
 * blockerId, or `timeout` elapses.
 *
 * `step` is Inngest's step tooling object (the one destructured from a
 * function handler's context, e.g. `async ({ step }) => { ... }`) — typed
 * loosely here rather than importing Inngest's internal step-tools type,
 * since every call site already has a concretely-typed `step` from its
 * own createFunction handler.
 *
 * Returns the human-supplied resumePayload (or {} if resolved with none),
 * or null if the wait timed out unresolved — callers MUST handle the null
 * case (e.g. fail the run with a clear "still blocked" message) rather
 * than assuming resolution always happens in time.
 */
export async function waitForBlockerResolution(
  step: { waitForEvent: (id: string, opts: { event: string; timeout: string; if: string }) => Promise<any> },
  blockerId: string,
  timeout = "30d"
): Promise<Record<string, unknown> | null> {
  const received = await step.waitForEvent(`wait-for-blocker-${blockerId}`, {
    event: "human-blocker/resolved",
    timeout,
    if: `async.data.blockerId == "${blockerId}"`,
  });
  if (!received) return null;
  return (received.data?.resumePayload as Record<string, unknown> | undefined) ?? {};
}

/** Dashboard/admin helper — open blockers for one engagement, oldest first. */
export async function listOpenBlockers(engagementId: string) {
  return db
    .select()
    .from(humanBlockers)
    .where(eq(humanBlockers.engagementId, engagementId));
}
