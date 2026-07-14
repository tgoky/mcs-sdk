import { db } from "@/lib/db";
import { winBackSendLog } from "@/models/schema";
import { deliverPersonalizedIntro } from "@/lib/platforms/email";
import { runHybridWithBudget } from "@/lib/hybrid-budget";

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

  await logSendOutcome(engagementId, enrollmentId, prospectEmail, result.outcome, result.latencyMs, result.error);
  return { sentVia: result.outcome, latencyMs: result.latencyMs, error: result.error };
}

async function logSendOutcome(
  engagementId: string,
  enrollmentId: string,
  prospectEmail: string,
  sentVia: "hybrid" | "fallback",
  latencyMs: number,
  error?: string
): Promise<void> {
  try {
    await db.insert(winBackSendLog).values({
      engagementId,
      enrollmentId,
      prospectEmail,
      sentVia,
      latencyMs,
      error,
    });
  } catch (e: any) {
    console.error("[win-back hybrid-personalizer] Failed to write win_back_send_log row:", e.message);
  }
}
