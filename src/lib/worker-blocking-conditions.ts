// src/lib/worker-blocking-conditions.ts
//
// The second half of the cross-worker blending shape — see
// worker-context-registry.ts's header for the first half (read-only
// context). This one answers a different question: "should this
// side-effecting action proceed right now." Same registry shape, same
// reason: a condition is owned by whichever worker defines it, and a
// caller runs the generic gate without ever naming that worker — a new
// blocking condition means one new map entry, picked up automatically by
// every caller that already calls getBlockingReasons; a new worker that
// needs to gate its own sends calls that same function, never touching
// the workers that defined the conditions it's checking.
//
// First real consumer: Pile-On and Win-Back's hybrid-personalizer.ts,
// which skip AI tone-generation (falling back to the plain template —
// already a fully-supported, non-broken outcome) while a client has an
// open reputation incident, rather than sending automated, cheerful sales
// copy with zero awareness of a live crisis.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getCrisisContext } from "@/lib/worker-context-registry";

export interface BlockingReason {
  conditionId: string;
  reason: string;
}

type BlockingCondition = (engagementId: string) => Promise<BlockingReason | null>;

export const WORKER_BLOCKING_CONDITIONS: Record<string, BlockingCondition> = {
  "rep-open-incident": async (engagementId) => {
    const context = await getCrisisContext(engagementId);
    if (!context?.hasOpenIncident) return null;
    return {
      conditionId: "rep-open-incident",
      reason: `This client has an open reputation incident (severity ${context.severityScore ?? "?"}) — automated tone-sensitive copy is on hold until it's resolved.`,
    };
  },
  // Phase 6 — Win-Back's bounce/complaint-rate auto-pause
  // (esp-delivery-monitor.ts). That module already unenrolls every
  // ACTIVE prospect the moment the threshold crosses; this condition is
  // what stops any NEW enrollment from being created while the pause is
  // still in effect. Cleared only by an operator's explicit resume
  // action (resumeWinBackSends), never automatically.
  "win-back-bounce-complaint-pause": async (engagementId) => {
    const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
    const stack = (row?.stack as EngagementStack | null) ?? null;
    if (!stack?.win_back_auto_paused) return null;
    return {
      conditionId: "win-back-bounce-complaint-pause",
      reason: stack.win_back_auto_paused_reason ?? "Win-Back is auto-paused pending a deliverability review.",
    };
  },
};

/** Runs every registered condition for this engagement and returns
 * whichever ones fired. Callers decide what "blocked" means for their own
 * action (skip AI personalization, hold a send, etc.) — this function
 * only ever reports facts, never enforces a specific response. */
export async function getBlockingReasons(engagementId: string): Promise<BlockingReason[]> {
  const results = await Promise.all(
    Object.values(WORKER_BLOCKING_CONDITIONS).map((check) => check(engagementId))
  );
  return results.filter((r): r is BlockingReason => r !== null);
}
