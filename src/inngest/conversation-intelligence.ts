import { inngest, conversationIntelligenceProcess } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, conversationIntelligenceSessions, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { fetchTranscriptText, extractObjectionsFromTranscript, type RecallRegion } from "@/lib/platforms/conversation-intelligence";
import { regenerateObjectionsBrief } from "@/features/pile-on/server/ad-creative-briefs";
import { notifyUser } from "@/lib/notify";

/**
 * Tier 4 #24 — conversation intelligence hooks. Triggered by the Recall
 * webhook handler once a bot's call is done. Closes the loop the AI
 * Architect Review's roadmap named explicitly: transcript -> extracted
 * objections -> topObjections, which Pile-On's ad-creative-briefs and
 * Pre-Call Read's brief synthesis both already read from.
 *
 * Also closes a gap that loop stopped short of: topObjections updating
 * is not the same as the Objections ad brief updating. Without the
 * regenerate-objections-brief step below, a buyer's ad brief is a
 * snapshot frozen at onboarding forever, no matter how many new
 * objections calls surface after that — "living document" in name only.
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

    // Merge + dedup (case-insensitive) into topObjections, and report back
    // which ones (if any) were genuinely new — everything downstream
    // (brief regeneration, the in-app notification) should only fire on
    // real news, not on a call that just re-raised something already on
    // file.
    const newObjections = await step.run("persist-extraction", async () => {
      await db
        .update(conversationIntelligenceSessions)
        .set({ extractedObjections: extraction.objections, extractionSummary: extraction.summary })
        .where(eq(conversationIntelligenceSessions.id, sessionId));

      if (extraction.objections.length === 0) return [];

      const existing: string[] =
        (await db.select({ topObjections: engagements.topObjections }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1))[0]
          ?.topObjections ?? [];

      const fresh = extraction.objections.filter((o) => !existing.some((m) => m.toLowerCase() === o.toLowerCase()));
      if (fresh.length === 0) return [];

      const merged = [...existing, ...fresh];
      await db.update(engagements).set({ topObjections: merged }).where(eq(engagements.engagementId, engagementId));
      return fresh;
    });

    if (newObjections.length === 0) {
      return { processed: true, objectionsFound: extraction.objections.length, newObjections: 0 };
    }

    // Regenerate ONLY the objections brief — but only if a brief set
    // already exists (i.e. onboarding has actually run). Nothing to
    // splice a fresh objections brief into otherwise, and a bare
    // one-pillar brief with no siblings isn't a state this app's
    // deliverables panel expects.
    await step.run("regenerate-objections-brief", async () => {
      const [row] = await db
        .select({
          adCreativeBriefs: engagements.adCreativeBriefs,
          topObjections: engagements.topObjections,
          brandVoiceProfile: engagements.brandVoiceProfile,
          offerDetails: engagements.offerDetails,
          existingProof: engagements.existingProof,
        })
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1);
      if (!row?.adCreativeBriefs) return { skipped: "no existing ad creative briefs to update" };

      const objectionsBrief = await regenerateObjectionsBrief({
        buyer: tenant.buyer,
        brandVoiceProfile: row.brandVoiceProfile,
        offerDetails: row.offerDetails ?? undefined,
        topObjections: row.topObjections ?? [],
        existingProof: row.existingProof ?? undefined,
      });

      const nextBriefs = row.adCreativeBriefs.briefs.map((b) => (b.pillar === "objections" ? objectionsBrief : b));
      await db
        .update(engagements)
        .set({
          adCreativeBriefs: {
            ...row.adCreativeBriefs,
            briefs: nextBriefs,
            objectionsLastRegeneratedAt: new Date().toISOString(),
          },
        })
        .where(eq(engagements.engagementId, engagementId));

      return { regenerated: true };
    });

    // Best-effort — same isolation as notifyRunOutcome in run-log.ts:
    // a Slack/DB hiccup here must never surface as a failure for what's
    // otherwise a fully successful transcript-processing run.
    await step.run("notify-user", async () => {
      try {
        await notifyUser({
          whopUserId: tenant.whopUserId,
          engagementId,
          type: "conversation_intelligence_objection_found",
          severity: "info",
          title: newObjections.length === 1 ? "New objection surfaced from a call" : `${newObjections.length} new objections surfaced from a call`,
          body: `${newObjections.slice(0, 3).join("; ")}${newObjections.length > 3 ? ", and more" : ""} — the Objections ad brief has been updated to address it.`,
          slackWebhookUrl: stack?.slack_webhook_url,
        });
      } catch (e) {
        console.error("[conversation-intelligence] failed to dispatch objection-found notification:", e);
      }
    });

    return { processed: true, objectionsFound: extraction.objections.length, newObjections: newObjections.length };
  }
);
