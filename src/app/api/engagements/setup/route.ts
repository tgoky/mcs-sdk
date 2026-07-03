import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { registerWebhookForTenant } from "@/lib/platforms/booking";
import { CalendlyClient } from "@/lib/platforms/booking";
import { publishConfirmationPage } from "@/lib/platforms/hosting";
import { buildConfirmationPageHtml } from "@/features/pin-down/server/page-builder";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { getSession } from "@/lib/session";
import { startRun, logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
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
  const summary = emptySummary();

  try {
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

    // =============================================================================
    // ✨ ZERO-CONFIG AUTO-DISCOVERY LAYER
    // Resolves Calendly Organization URI and Event Type UUID server-side
    // using the API key the user already provided. This eliminates two major
    // UX friction points: hunting for API-only identifiers and copy-pasting UUIDs.
    // =============================================================================
    const finalStack = { ...stack };

    if (finalStack.booking_platform === "calendly" && credentials?.booking) {
      try {
        const calendlyClient = new CalendlyClient(credentials.booking);

        // Step A: Resolve the organization URI from the user's profile
        const resolvedOrgUri = await calendlyClient.getCurrentOrganization();

        finalStack.booking_platform_meta = {
          ...finalStack.booking_platform_meta,
          organization_uri: resolvedOrgUri,
        };

        console.log(
          `[pin-down setup] Auto-discovered Calendly org URI: ${resolvedOrgUri}`
        );

        // Step B: If a standing link was provided, find the matching event type
        if (finalStack.booking_standing_link) {
          const resolvedUuid = await calendlyClient.getEventTypeUuidFromSlug(
            resolvedOrgUri,
            finalStack.booking_standing_link
          );

          if (resolvedUuid) {
            finalStack.booking_platform_meta.event_type_uuid = resolvedUuid;
            console.log(
              `[pin-down setup] Auto-discovered Calendly event type UUID: ${resolvedUuid}`
            );
          } else {
            console.warn(
              `[pin-down setup] Could not auto-discover event type UUID from standing link: ${finalStack.booking_standing_link}`
            );
            summary.openItems.push(
              `Could not auto-detect the Calendly event type from the standing link "${finalStack.booking_standing_link}". Webhook registration may require manual configuration.`
            );
          }
        }
      } catch (discoveryErr: any) {
        console.error(
          "[pin-down setup] Calendly metadata auto-discovery warning:",
          discoveryErr.message
        );
        summary.openItems.push(
          `Calendly metadata auto-discovery notice: ${discoveryErr.message}`
        );
        // Don't throw — continue with setup and let webhook registration fail gracefully
      }
    }
    // =============================================================================

    await startRun({
      id: runId,
      engagementId,
      skillName: "pin-down",
      phase: "onboarding_start",
      label: buyerName,
    });

    // Step 1: Store credentials encrypted in DB
    await logStep(runId, { phase: "credential_storage", status: "running" });

    if (credentials?.booking) {
      await storeCredential(
        engagementId,
        finalStack.booking_platform,
        `secrets://${engagementId}/${finalStack.booking_platform}_pat`,
        credentials.booking
      );
    }
    if (credentials?.email) {
      await storeCredential(
        engagementId,
        finalStack.email_platform,
        `secrets://${engagementId}/${finalStack.email_platform}_key`,
        credentials.email
      );
    }
    if (credentials?.hosting) {
      await storeCredential(
        engagementId,
        finalStack.hosting_platform,
        `secrets://${engagementId}/${finalStack.hosting_platform}_key`,
        credentials.hosting
      );
    }
    summary.whatWasAttempted.push(
      `Stored ${[
        credentials?.booking && finalStack.booking_platform,
        credentials?.email && finalStack.email_platform,
        credentials?.hosting && finalStack.hosting_platform,
      ]
        .filter(Boolean)
        .join(" + ") || "no"} credentials.`
    );
    summary.whatWorked.push("Credentials encrypted and stored.");
    await logStep(runId, {
      phase: "credential_storage",
      status: "success",
      detail: credentials?.booking || credentials?.email ? "Credentials stored" : "No credentials supplied",
    });

    // Step 2: Extract brand voice profile
    await logStep(runId, { phase: "voice_extraction", status: "running" });
    const voiceProfile = await extractVoiceProfile(rawVoiceCorpus ?? "", runId);
    const corpusWordCount = (rawVoiceCorpus ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    summary.whatWasAttempted.push(
      `Extracted brand voice profile from a ${corpusWordCount}-word corpus.`
    );
    if (voiceProfile?.source_path === "scrape") {
      summary.whatWorked.push(
        "Brand voice profile extracted from buyer-supplied corpus via Claude."
      );
    } else {
      summary.whatWorked.push(
        "Brand voice profile set to neutral default (corpus under 500 words)."
      );
      summary.openItems.push(
        "Corpus was too short for a real voice extraction — using the operator-grade default tone."
      );
    }
    await logStep(runId, {
      phase: "voice_extraction",
      status: "success",
      detail:
        voiceProfile?.source_path === "scrape"
          ? "Tone profile extracted from corpus"
          : "Neutral default tone applied",
    });

    // Step 3: Publish confirmation page
    await logStep(runId, { phase: "confirmation_page_deploy", status: "running" });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.muddventures.com";
    const internalFallbackUrl = `${appUrl}/confirm/${engagementId}`;

    const pageContent = buildConfirmationPageHtml({
      buyer: buyerName,
      offerDetails,
      brandVoiceProfile: voiceProfile,
      topCallQuestions: topCallQuestions ?? [],
      prospectMeets: prospectMeets ?? "founder",
      existingProof: body.existingProof,
    });

    const deployResult = await publishConfirmationPage(
      finalStack.hosting_platform,
      credentials?.hosting ?? null,
      finalStack.hosting_platform_meta,
      pageContent,
      engagementId
    );

    let confirmationPageUrl: string;
    let confirmationPageDeployment: {
      mode: "live" | "paste_ready" | "not_deployed";
      deployedVia?: string;
      reason?: string;
      lastAttemptedAt: string;
    };

    if (deployResult.mode === "live") {
      confirmationPageUrl = deployResult.url;
      confirmationPageDeployment = {
        mode: "live",
        deployedVia: deployResult.deployedVia,
        lastAttemptedAt: new Date().toISOString(),
      };
      summary.whatWorked.push(
        `Confirmation page published live on the buyer's own ${finalStack.hosting_platform} at ${deployResult.url}.`
      );
      await logStep(runId, {
        phase: "confirmation_page_deploy",
        status: "success",
        detail: `Live on buyer's ${finalStack.hosting_platform}: ${deployResult.url}`,
      });
    } else {
      confirmationPageUrl = internalFallbackUrl;
      confirmationPageDeployment = {
        mode: "paste_ready",
        reason: deployResult.reason,
        lastAttemptedAt: new Date().toISOString(),
      };
      summary.whatFailed.push(
        `Could not auto-publish to ${finalStack.hosting_platform}: ${deployResult.reason}`
      );
      summary.openItems.push(
        `[needs:manual-page-publish] Paste-ready HTML and instructions are ready for ${finalStack.hosting_platform} — the buyer needs to publish it manually. Using the internal preview page at ${internalFallbackUrl} until then.`
      );
      await logStep(runId, {
        phase: "confirmation_page_deploy",
        status: "failed",
        detail: deployResult.reason,
      });
    }

    // Step 4: Upsert engagement row using finalStack (with auto-discovered metadata)
    await logStep(runId, { phase: "engagement_upsert", status: "running" });

    const engagementValues = {
      id: crypto.randomUUID(),
      engagementId,
      whopUserId,
      buyer: buyerName,
      schemaVersion: "1.0",
      stack: {
        ...finalStack,
        slack_webhook_url:
          credentials?.slack_webhook_url ?? finalStack.slack_webhook_url,
      },
      offerDetails,
      brandVoiceProfile: voiceProfile,
      confirmationPageUrl,
      confirmationPageDeployment,
      existingProof: body.existingProof,
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
          confirmationPageDeployment,
          existingProof: body.existingProof,
          topCallQuestions: topCallQuestions ?? [],
          topObjections: topObjections ?? [],
          prospectMeets: prospectMeets ?? "founder",
          updatedAt: new Date(),
        },
      });
    await logStep(runId, {
      phase: "engagement_upsert",
      status: "success",
      detail: `Engagement row created for ${buyerName}`,
    });
    summary.whatWasAttempted.push(
      `Created confirmation page at ${confirmationPageUrl}.`
    );
    summary.whatWorked.push("Engagement record created/updated in Postgres.");

    // Step 5: Register webhook on booking platform
    await logStep(runId, { phase: "webhook_registration", status: "running" });

    if (credentials?.booking) {
      const receiverUrl = `${appUrl}/api/webhooks/booking-event?engagement_id=${engagementId}`;
      summary.whatWasAttempted.push(
        `Registered ${finalStack.booking_platform} webhook → ${receiverUrl}.`
      );
      try {
        const subscriptionId = await registerWebhookForTenant(
          finalStack.booking_platform,
          credentials.booking,
          receiverUrl,
          finalStack.booking_platform_meta // Now includes auto-discovered org_uri and event_type_uuid
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
          summary.whatWorked.push(
            `${finalStack.booking_platform} webhook registered (subscription ${subscriptionId}).`
          );
          await logStep(runId, {
            phase: "webhook_registration",
            status: "success",
            detail: `Subscription ${subscriptionId}`,
          });
        } else {
          summary.openItems.push(
            `${finalStack.booking_platform} webhook registration returned no subscription ID — bookings may need manual verification.`
          );
          await logStep(runId, {
            phase: "webhook_registration",
            status: "skipped",
            detail: "No subscription ID returned",
          });
        }
      } catch (e: any) {
        console.error(`[pin-down] Webhook registration failed: ${e.message}`);
        summary.whatFailed.push(
          `${finalStack.booking_platform} webhook registration failed: ${e.message}`
        );
        summary.openItems.push(
          "Booking webhook is not connected — Pile-On and Win-Back won't fire automatically until this is fixed."
        );
        await logStep(runId, {
          phase: "webhook_registration",
          status: "failed",
          detail: e.message,
        });
      }
    } else {
      await logStep(runId, {
        phase: "webhook_registration",
        status: "skipped",
        detail: "No booking credentials supplied",
      });
    }

    // Step 6: Configure post-booking redirect (Calendly only)
    await logStep(runId, { phase: "redirect_config", status: "running" });

    if (
      finalStack.booking_platform === "calendly" &&
      credentials?.booking &&
      finalStack.booking_platform_meta?.event_type_uuid
    ) {
      summary.whatWasAttempted.push(
        `Configured Calendly redirect for event type ${finalStack.booking_platform_meta.event_type_uuid}.`
      );
      try {
        const calendlyClient = new CalendlyClient(credentials.booking);
        await calendlyClient.configurePostBookingRedirect(
          finalStack.booking_platform_meta.event_type_uuid,
          confirmationPageUrl
        );
        summary.whatWorked.push("Calendly post-booking redirect configured.");
        await logStep(runId, {
          phase: "redirect_config",
          status: "success",
        });
      } catch (e: any) {
        console.error(
          `[pin-down] Calendly redirect config failed: ${e.message}`
        );
        summary.whatFailed.push(
          `Calendly redirect configuration failed: ${e.message}`
        );
        summary.openItems.push(
          "Calendly isn't redirecting to the confirmation page yet — set this manually or re-run setup."
        );
        await logStep(runId, {
          phase: "redirect_config",
          status: "failed",
          detail: e.message,
        });
      }
    } else {
      await logStep(runId, {
        phase: "redirect_config",
        status: "skipped",
        detail:
          !finalStack.booking_platform_meta?.event_type_uuid
            ? "No event type UUID available (auto-discovery may have failed or no standing link provided)"
            : "Not applicable for this booking platform",
      });
    }

    summary.decisionsMade.push(
      `Brief landing destination: ${finalStack.brief_landing_destination ?? "slack"} (${credentials?.slack_webhook_url || finalStack.slack_webhook_url ? "webhook configured" : "default"}).`
    );

    await finishRun(runId, { summary });

    return NextResponse.json({
      success: true,
      engagementId,
      confirmationPageUrl,
      confirmationPageDeployment,
      pasteReadyHtml:
        deployResult.mode === "paste_ready" ? deployResult.html : undefined,
      pasteReadyInstructions:
        deployResult.mode === "paste_ready"
          ? deployResult.instructions
          : undefined,
      runId,
    });
  } catch (error: any) {
    console.error("[pin-down setup]", error.message);
    summary.whatFailed.push(error.message);
    await failRun(runId, error, { summary });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}