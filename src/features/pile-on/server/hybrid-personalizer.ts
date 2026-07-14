import { db } from "@/lib/db";
import { pileOnSendLog } from "@/models/schema";
import { deliverPersonalizedIntro } from "@/lib/platforms/email";
import { runHybridWithBudget } from "@/lib/hybrid-budget";

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

  await logSendOutcome(engagementId, bookingId, prospectEmail, result.outcome, result.latencyMs, result.error);
  return { sentVia: result.outcome, latencyMs: result.latencyMs, error: result.error };
}

async function logSendOutcome(
  engagementId: string,
  bookingId: string,
  prospectEmail: string,
  sentVia: "hybrid" | "fallback",
  latencyMs: number,
  error?: string
): Promise<void> {
  try {
    await db.insert(pileOnSendLog).values({
      engagementId,
      bookingId,
      prospectEmail,
      sentVia,
      latencyMs,
      error,
    });
  } catch (e: any) {
    // Logging failure should never surface as the enrollment's failure —
    // worst case the buyer's send-log dashboard is missing one row.
    console.error("[hybrid-personalizer] Failed to write pile_on_send_log row:", e.message);
  }
}
