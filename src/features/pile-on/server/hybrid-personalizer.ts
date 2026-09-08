import { db } from "@/lib/db";
import { pileOnSendLog } from "@/models/schema";
import { deliverPersonalizedIntro } from "@/lib/platforms/email";
import { runHybridWithBudget } from "@/lib/hybrid-budget";
import { getBlockingReasons } from "@/lib/worker-blocking-conditions";

/**
 * Pile-On recovery gap 3 — hybrid first-email personalization. The
 * templated Email 1 ALWAYS fires first via the normal
 * enrollInPreCallSequence() call in enrollment-service.ts — this function
 * only ever adds a personalized intro on top (via
 * deliverPersonalizedIntro's tag-and-let-the-buyer's-template-merge-it-in
 * pattern), so "fallback" here means "the personalized intro never
 * arrived," not "no email went out." No email is ever skipped, matching
 * the OG SKILL.md's explicit guarantee.
 *
 * Budget enforcement itself lives in src/lib/hybrid-budget.ts, shared
 * with Win-Back's equivalent (win-back/server/hybrid-personalizer.ts) —
 * this file is just the Pile-On-specific prompt and the pile_on_send_log
 * write.
 */
export interface HybridPersonalizationResult {
  sentVia: "hybrid" | "fallback";
  latencyMs: number;
  error?: string;
}

export async function runHybridPersonalization(
  engagementId: string,
  bookingId: string,
  prospectEmail: string,
  prospectName: string,
  emailPlatform: string,
  emailApiKey: string,
  emailPlatformMeta: Record<string, any> | undefined,
  brandVoiceProfile: any,
  offerDetails: any,
  runId?: string
): Promise<HybridPersonalizationResult> {
  // Cross-worker blend: skip AI tone-generation while this client has an
  // open reputation incident — see worker-blocking-conditions.ts. The
  // templated booking confirmation has already gone out via
  // enrollInPreCallSequence before this function ever runs, so nothing
  // about the prospect's confirmation is held up; this only withholds the
  // extra AI-personalized, tone-sensitive intro.
  //
  // Fails open, deliberately: runHybridWithBudget below wraps its own
  // body in try/catch and never throws, which is why the caller
  // (enrollment-service.ts) has no try/catch around this function either
  // — a DB blip on this check must never crash the whole booking
  // enrollment (SMS, ad-cohort sync) for the sake of a tone check.
  let blockingReasons: Awaited<ReturnType<typeof getBlockingReasons>> = [];
  try {
    blockingReasons = await getBlockingReasons(engagementId);
  } catch (e: unknown) {
    console.error("[hybrid-personalizer] Blocking-conditions check failed, proceeding as unblocked:", e instanceof Error ? e.message : e);
  }
  if (blockingReasons.length > 0) {
    const reason = blockingReasons.map((r) => r.reason).join(" ");
    await logSendOutcome(engagementId, bookingId, prospectEmail, "fallback", 0, undefined, reason, runId);
    return { sentVia: "fallback", latencyMs: 0, error: reason };
  }

  const result = await runHybridWithBudget({
    system: `You are the email rewriting engine for Pile-On.
Voice parameters: ${JSON.stringify(brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(offerDetails ?? {})}
Write a personalized booking confirmation intro paragraph. Under 70 words. No generic greetings. Reference the specific value this call will deliver.`,
    userMessage: `Prospect: ${prospectName} (${prospectEmail})`,
    maxTokens: 200,
    runId,
    deliver: (text) => deliverPersonalizedIntro(emailPlatform, emailApiKey, prospectEmail, text, emailPlatformMeta ?? {}),
  });

  await logSendOutcome(engagementId, bookingId, prospectEmail, result.outcome, result.latencyMs, result.text, result.error, runId);
  return { sentVia: result.outcome, latencyMs: result.latencyMs, error: result.error };
}

async function logSendOutcome(
  engagementId: string,
  bookingId: string,
  prospectEmail: string,
  sentVia: "hybrid" | "fallback",
  latencyMs: number,
  personalizedIntro: string | undefined,
  error: string | undefined,
  runId: string | undefined
): Promise<void> {
  try {
    await db.insert(pileOnSendLog).values({
      engagementId,
      bookingId,
      prospectEmail,
      runId,
      sentVia,
      personalizedIntro,
      latencyMs,
      error,
    });
  } catch (e: any) {
    // Logging failure should never surface as the enrollment's failure —
    // worst case the buyer's send-log dashboard is missing one row.
    console.error("[hybrid-personalizer] Failed to write pile_on_send_log row:", e.message);
  }
}
