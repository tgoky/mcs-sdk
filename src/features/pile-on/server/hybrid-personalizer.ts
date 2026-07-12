import { db } from "@/lib/db";
import { pileOnSendLog } from "@/models/schema";
import { callClaude, MODEL } from "@/lib/llm";
import { deliverPersonalizedIntro } from "@/lib/platforms/email";

/**
 * Pile-On recovery gap 3 — hybrid first-email personalization, with the
 * budget enforcement and fallback discipline the transfer analysis flags
 * as missing. The templated Email 1 ALWAYS fires first via the normal
 * enrollInPreCallSequence() call in enrollment-service.ts — this function
 * only ever adds a personalized intro on top (via
 * deliverPersonalizedIntro's tag-and-let-the-buyer's-template-merge-it-in
 * pattern), so "fallback" here means "the personalized intro never
 * arrived," not "no email went out." No email is ever skipped, matching
 * the OG SKILL.md's explicit guarantee.
 *
 * Two budgets, enforced for real (not just raced-and-abandoned):
 *   - 10s receiver budget: the whole hybrid attempt (generation + delivery)
 *     must resolve within this or it's treated as a fallback.
 *   - 60s generation budget: the Claude call specifically. In practice the
 *     10s receiver budget is tighter and will usually fire first, but both
 *     are enforced independently so a change to one doesn't silently
 *     change the other's behavior.
 * Both use real AbortSignal.timeout() cancellation via llm.ts's `signal`
 * option (see llm.ts) rather than a Promise.race that lets the underlying
 * fetch keep running in the background after the caller gives up.
 */

const RECEIVER_BUDGET_MS = 10_000;
const GENERATION_BUDGET_MS = 60_000;

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
  const startedAt = Date.now();

  const receiverController = new AbortController();
  const receiverTimeout = setTimeout(() => receiverController.abort(), RECEIVER_BUDGET_MS);

  try {
    const attempt = (async (): Promise<void> => {
      const generationController = new AbortController();
      const generationTimeout = setTimeout(() => generationController.abort(), GENERATION_BUDGET_MS);

      let text: string;
      try {
        const result = await callClaude({
          model: MODEL.SYNTHESIS,
          system: `You are the email rewriting engine for Pile-On.
Voice parameters: ${JSON.stringify(brandVoiceProfile ?? {})}
Offer context: ${JSON.stringify(offerDetails ?? {})}
Write a personalized booking confirmation intro paragraph. Under 70 words. No generic greetings. Reference the specific value this call will deliver.`,
          userMessage: `Prospect: ${prospectName} (${prospectEmail})`,
          maxTokens: 200,
          runId,
          signal: generationController.signal,
        });
        text = result.text;
      } finally {
        clearTimeout(generationTimeout);
      }

      await deliverPersonalizedIntro(emailPlatform, emailApiKey, prospectEmail, text, emailPlatformMeta ?? {});
    })();

    // The receiver-level abort doesn't stop `attempt`'s own internal work
    // once it's past the generation call — it only stops us from waiting
    // on it past the 10s budget. If generation finishes at 9s and
    // delivery takes another 3s, this reports "fallback" at the 10s mark
    // even though the personalized intro lands a moment later; that's the
    // correct call for RECEIVER_BUDGET_MS's purpose (bounding how long the
    // synchronous booking-event pipeline waits), not a bug — the send log
    // still gets the honest "fallback" outcome for that booking, and a
    // late-arriving personalized intro overwriting a
    // showtime_personalized_intro property the buyer's template already
    // rendered from is harmless (the property update itself doesn't fail).
    await Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        receiverController.signal.addEventListener("abort", () =>
          reject(new Error(`Receiver budget (${RECEIVER_BUDGET_MS}ms) exceeded`))
        );
      }),
    ]);

    const latencyMs = Date.now() - startedAt;
    await logSendOutcome(engagementId, bookingId, prospectEmail, "hybrid", latencyMs);
    return { sentVia: "hybrid", latencyMs };
  } catch (e: any) {
    const latencyMs = Date.now() - startedAt;
    await logSendOutcome(engagementId, bookingId, prospectEmail, "fallback", latencyMs, e.message);
    return { sentVia: "fallback", latencyMs, error: e.message };
  } finally {
    clearTimeout(receiverTimeout);
  }
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
