import { db } from "@/lib/db";
import { winBackSendLog } from "@/models/schema";
import { deliverPersonalizedIntro } from "@/lib/platforms/email";
import { runHybridWithBudget } from "@/lib/hybrid-budget";
import { getBlockingReasons } from "@/lib/worker-blocking-conditions";

/**
 * Win-Back recovery gap 5 — "same recipe as Pile-On gap 3, applied to
 * Win-Back's message-1 slot" per the transfer analysis. The templated
 * first recovery email ALWAYS fires first via the normal
 * enrollInWinBackSequence() call in enrollment-service.ts — this only
 * ever adds a personalized opening on top, via the same
 * deliverPersonalizedIntro tag-and-merge pattern Pile-On uses (there's no
 * Win-Back-specific delivery mechanism needed — it's the identical
 * "set a contact property, buyer's template merges it in" operation
 * regardless of which sequence the property ends up rendered into).
 * "Fallback" means "no personalized opening," never "no recovery email."
 *
 * Budget enforcement lives in src/lib/hybrid-budget.ts, shared with
 * Pile-On's equivalent — this file is just the Win-Back-specific prompt
 * and the win_back_send_log write.
 */
export interface WinBackHybridResult {
  sentVia: "hybrid" | "fallback";
  latencyMs: number;
  error?: string;
}

export async function runWinBackHybridPersonalization(
  engagementId: string,
  enrollmentId: string,
  prospectEmail: string,
  prospectName: string,
  emailPlatform: string,
  emailApiKey: string,
  emailPlatformMeta: Record<string, any> | undefined,
  brandVoiceProfile: any,
  offerDetails: any,
  runId?: string
): Promise<WinBackHybridResult> {
  // Cross-worker blend — same reasoning as Pile-On's own hybrid-
  // personalizer.ts: skip the AI-personalized "we missed you" opening
  // while a reputation incident is open for this client, rather than
  // sending automated warm-tone copy blind to a live crisis. The
  // templated recovery email itself still goes out via
  // enrollInWinBackSequence before this function runs.
  //
  // Fails open: runHybridWithBudget below never throws (its own
  // try/catch), which is why this function's caller has no try/catch of
  // its own — a DB blip on this check must never crash the whole
  // recovery enrollment for the sake of a tone check.
  let blockingReasons: Awaited<ReturnType<typeof getBlockingReasons>> = [];
  try {
    blockingReasons = await getBlockingReasons(engagementId);
  } catch (e: unknown) {
    console.error("[win-back hybrid-personalizer] Blocking-conditions check failed, proceeding as unblocked:", e instanceof Error ? e.message : e);
  }
  if (blockingReasons.length > 0) {
    const reason = blockingReasons.map((r) => r.reason).join(" ");
    await logSendOutcome(engagementId, enrollmentId, prospectEmail, "fallback", 0, undefined, reason);
    return { sentVia: "fallback", latencyMs: 0, error: reason };
  }

  const result = await runHybridWithBudget({
    system: `You are the email rewriting engine for Win-Back.
Voice parameters: ${JSON.stringify(brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(offerDetails ?? {})}
Write a personalized opening paragraph for the FIRST recovery email to a prospect who missed/cancelled their call. Under 70 words. Warm, low-stakes "we missed you" tone — never guilt-trip, never pressure. No generic greetings.`,
    userMessage: `Prospect: ${prospectName} (${prospectEmail})`,
    maxTokens: 200,
    runId,
    deliver: (text) => deliverPersonalizedIntro(emailPlatform, emailApiKey, prospectEmail, text, emailPlatformMeta ?? {}),
  });

  await logSendOutcome(engagementId, enrollmentId, prospectEmail, result.outcome, result.latencyMs, result.text, result.error);
  return { sentVia: result.outcome, latencyMs: result.latencyMs, error: result.error };
}

async function logSendOutcome(
  engagementId: string,
  enrollmentId: string,
  prospectEmail: string,
  sentVia: "hybrid" | "fallback",
  latencyMs: number,
  personalizedOpening: string | undefined,
  error: string | undefined
): Promise<void> {
  try {
    await db.insert(winBackSendLog).values({
      engagementId,
      enrollmentId,
      prospectEmail,
      sentVia,
      personalizedOpening,
      latencyMs,
      error,
    });
  } catch (e: any) {
    console.error("[win-back hybrid-personalizer] Failed to write win_back_send_log row:", e.message);
  }
}
