import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { registerWebhookForTenant } from "@/lib/platforms/booking";
import { CalendlyClient } from "@/lib/platforms/booking";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { getSession } from "@/lib/session";
import crypto from "crypto";

async function extractVoiceProfile(corpus: string, runId: string): Promise<any> {
  const wordCount = corpus.trim().split(/\s+/).length;

  if (wordCount < 500) {
    return {
      source_path: "default",
      extracted_at: new Date().toISOString(),
      tone: {
        formal_casual: { score: 3, note: "Operator-grade, plain analytical posture." },
        technical_plain: { score: 3, note: "Balanced, jargon-free." },
        warm_neutral: { score: 3, note: "Direct, non-promotional." },
      },
      vocabulary: { signature: ["outcome", "pipeline", "process"], brand_terms: [] },
      sentence_length: { short_pct: 30, medium_pct: 55, long_pct: 15 },
      banned_phrases: [
        { phrase: "revolutionary", confidence: 0.95 },
        { phrase: "best-in-class", confidence: 0.9 },
      ],
    };
  }

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system: `You are a brand voice analyst. Analyze this text corpus and return ONLY valid JSON matching this exact schema:
{
  "tone": {
    "formal_casual": { "score": 1-5, "note": "string" },
    "technical_plain": { "score": 1-5, "note": "string" },
    "warm_neutral": { "score": 1-5, "note": "string" }
  },
  "vocabulary": {
    "signature": ["up to 8 distinctive words/phrases"],
    "brand_terms": ["product-specific terms"]
  },
  "sentence_length": { "short_pct": number, "medium_pct": number, "long_pct": number },
  "banned_phrases": [{ "phrase": "string", "confidence": 0.0-1.0 }]
}
Return nothing but the JSON object. No preamble, no markdown.`,
    userMessage: `Analyze this corpus (${wordCount} words):\n\n${corpus.substring(0, 40000)}`,
    maxTokens: 1000,
    runId,
  });

  try {
    const parsed = JSON.parse(result.text);
    return { ...parsed, source_path: "scrape", extracted_at: new Date().toISOString() };
  } catch {
    return {
      source_path: "default",
      extracted_at: new Date().toISOString(),
      note: "Voice extraction parse failed — using neutral default.",
    };
  }
}

export async function POST(request: Request) {
  const runId = crypto.randomUUID();

  try {
    // FIXED: Enforce session verification parameters to pull whopUserId safely
    const session = await getSession();
    if (!session?.whopUserId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const whopUserId = session.whopUserId;

    const body = await request.json();
    const {
      engagementId,
      buyerName,
      offerDetails,
      stack,
      topCallQuestions,
      topObjections,
      prospectMeets,
      rawVoiceCorpus,
      credentials,
    } = body;

    if (!engagementId || !buyerName) {
      return new Response("Missing required fields: engagementId, buyerName", { status: 400 });
    }

    if (!stack?.booking_platform || !stack?.email_platform) {
      return new Response("Missing required stack config: booking_platform and email_platform", { status: 400 });
    }

    await db.insert(skillRuns).values({
      id: runId,
      engagementId,
      skillName: "pin-down",
      phase: "onboarding_start",
      status: "running",
      startedAt: new Date(),
    });

    // Step 1: Store credentials encrypted in DB
    await db.update(skillRuns).set({ phase: "credential_storage" }).where(eq(skillRuns.id, runId));

    if (credentials?.booking) {
      await storeCredential(
        engagementId,
        stack.booking_platform,
        `secrets://${engagementId}/${stack.booking_platform}_pat`,
        credentials.booking
      );
    }
    if (credentials?.email) {
      await storeCredential(
        engagementId,
        stack.email_platform,
        `secrets://${engagementId}/${stack.email_platform}_key`,
        credentials.email
      );
    }

    // Step 2: Extract brand voice profile
    await db.update(skillRuns).set({ phase: "voice_extraction" }).where(eq(skillRuns.id, runId));
    const voiceProfile = await extractVoiceProfile(rawVoiceCorpus ?? "", runId);

    // Step 3: Build confirmation page URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.muddventures.com";
    const confirmationPageUrl = `${appUrl}/confirm/${engagementId}`;

    // Step 4: Upsert engagement row
    await db.update(skillRuns).set({ phase: "engagement_upsert" }).where(eq(skillRuns.id, runId));

    const engagementValues = {
      id: crypto.randomUUID(),
      engagementId,
      whopUserId,
      buyer: buyerName,
      schemaVersion: "1.0",
      stack: {
        ...stack,
        slack_webhook_url: credentials?.slack_webhook_url ?? stack.slack_webhook_url,
      },
      offerDetails,
      brandVoiceProfile: voiceProfile,
      confirmationPageUrl,
      topCallQuestions: topCallQuestions ?? [],
      topObjections: topObjections ?? [],
      prospectMeets: prospectMeets ?? "founder",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db
      .insert(engagements)
      .values(engagementValues)
      .onConflictDoUpdate({
        target: engagements.engagementId,
        set: {
          stack: engagementValues.stack,
          offerDetails,
          brandVoiceProfile: voiceProfile,
          confirmationPageUrl,
          topCallQuestions: topCallQuestions ?? [],
          topObjections: topObjections ?? [],
          prospectMeets: prospectMeets ?? "founder",
          updatedAt: new Date(),
        },
      });

    // Step 5: Register webhook on booking platform
    await db.update(skillRuns).set({ phase: "webhook_registration" }).where(eq(skillRuns.id, runId));

    if (credentials?.booking) {
      const receiverUrl = `${appUrl}/api/webhooks/booking-event?engagement_id=${engagementId}`;
      try {
        const subscriptionId = await registerWebhookForTenant(
          stack.booking_platform,
          credentials.booking,
          receiverUrl,
          stack.booking_platform_meta
        );

        if (subscriptionId) {
          await db
            .update(engagements)
            .set({
              stack: {
                ...engagementValues.stack,
                webhook_subscription_id: subscriptionId as string,
              },
              updatedAt: new Date(),
            })
            .where(eq(engagements.engagementId, engagementId));
        }
      } catch (e: any) {
        console.error(`[pin-down] Webhook registration failed: ${e.message}`);
      }
    }

    // Step 6: Configure post-booking redirect (Calendly only)
    await db.update(skillRuns).set({ phase: "redirect_config" }).where(eq(skillRuns.id, runId));

    if (
      stack.booking_platform === "calendly" &&
      credentials?.booking &&
      stack.booking_platform_meta?.event_type_uuid
    ) {
      try {
        const calendlyClient = new CalendlyClient(credentials.booking);
        await calendlyClient.configurePostBookingRedirect(
          stack.booking_platform_meta.event_type_uuid,
          confirmationPageUrl
        );
      } catch (e: any) {
        console.error(`[pin-down] Calendly redirect config failed: ${e.message}`);
      }
    }

    await db.update(skillRuns).set({ status: "success", completedAt: new Date() }).where(eq(skillRuns.id, runId));

    return NextResponse.json({
      success: true,
      engagementId,
      confirmationPageUrl,
      runId,
    });
  } catch (error: any) {
    console.error("[pin-down setup]", error.message);
    await db.update(skillRuns).set({ status: "failed", completedAt: new Date() }).where(eq(skillRuns.id, runId)).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}