import { inngest, conversationIntelligenceProcess } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, conversationIntelligenceSessions, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { fetchTranscriptText, extractObjectionsFromTranscript, type RecallRegion } from "@/lib/platforms/conversation-intelligence";

/**
 * Tier 4 #24 — conversation intelligence hooks. Triggered by the Recall
 * webhook handler once a bot's call is done. Closes the loop the AI
 * Architect Review's roadmap named explicitly: transcript -> extracted
 * objections -> topObjections, which Pile-On's ad-creative-briefs and
 * Pre-Call Read's brief synthesis both already read from.
 */
export const processConversationIntelligenceTranscript = inngest.createFunction(
  { id: "process-conversation-intelligence-transcript", triggers: [conversationIntelligenceProcess] },
  async ({ event, step }) => {
    const { engagementId, sessionId } = event.data;

    const tenant = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });
    if (!tenant) return { processed: false, reason: "engagement not found" };

    const stack = tenant.stack as EngagementStack | null;
    if (stack?.conversation_intelligence_provider !== "recall_ai") {
      return { processed: false, reason: "conversation intelligence not enabled for this engagement" };
    }

    const session = await step.run("load-session", async () => {
      const [row] = await db.select().from(conversationIntelligenceSessions).where(eq(conversationIntelligenceSessions.id, sessionId)).limit(1);
      return row ?? null;
    });
    if (!session) return { processed: false, reason: "session not found" };

    const transcriptText = await step.run("fetch-transcript", async () => {
      const apiKey = await resolveCredential(engagementId, "recall_ai");
      const region = (stack?.conversation_intelligence_meta?.recall_region ?? "us-east-1") as RecallRegion;
      return fetchTranscriptText({ apiKey, region }, session.recallBotId);
    });

    if (!transcriptText) {
      await step.run("mark-no-transcript", () =>
        db
          .update(conversationIntelligenceSessions)
          .set({ extractionSummary: "No transcript was available for this call (Recall returned no download URL)." })
          .where(eq(conversationIntelligenceSessions.id, sessionId))
      );
      return { processed: false, reason: "no transcript available" };
    }

    const extraction = await step.run("extract-objections", () => extractObjectionsFromTranscript(transcriptText));

    await step.run("persist-extraction", async () => {
      await db
        .update(conversationIntelligenceSessions)
        .set({ extractedObjections: extraction.objections, extractionSummary: extraction.summary })
        .where(eq(conversationIntelligenceSessions.id, sessionId));

      if (extraction.objections.length > 0) {
        const existing: string[] = (await db.select({ topObjections: engagements.topObjections }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1))[0]
          ?.topObjections ?? [];
        // Merge + dedup (case-insensitive) rather than append — the same
        // objection surfacing across multiple calls shouldn't grow the
        // list unboundedly.
        const merged = [...existing];
        for (const o of extraction.objections) {
          if (!merged.some((m) => m.toLowerCase() === o.toLowerCase())) merged.push(o);
        }
        await db.update(engagements).set({ topObjections: merged }).where(eq(engagements.engagementId, engagementId));
      }
    });

    return { processed: true, objectionsFound: extraction.objections.length };
  }
);
