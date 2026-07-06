import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { registerWebhookForTenant, CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { publishConfirmationPage } from "@/lib/platforms/hosting";
import { buildConfirmationPageHtml } from "./page-builder";
import { buildAdCreativeBriefs } from "@/features/pile-on/server/ad-creative-briefs";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

// Same loose typing rationale as brief-service.ts/audit-engine.ts — avoids
// a circular import back to src/lib/inngest.ts, and lets this function be
// called with no step context at all if it's ever needed outside a worker.
type StepTools = GetStepTools<Inngest.Any>;

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
    userMessage: `Analyze this content: ${corpus}`,
    maxTokens: 2500,
    runId,
  });

  let parsed: any;
  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { source_path: "neutral_default" };
  }
  return parsed;
}

/**
 * Pin-down onboarding — the actual heavy lifting.
 *
 * This used to run entirely inline inside the POST /api/engagements/setup
 * request handler: one HTTP request doing a real Claude call (voice
 * extraction), a hosting-platform deploy, and up to 3 round trips to the
 * booking platform's API (org/event discovery, webhook registration,
 * redirect config) — all serially, all before sending a response. On a
 * live buyer's account with a real Calendly key and a real corpus, that
 * routinely ran well past what a serverless platform allows a function to
 * run before killing it and dropping the connection — the client would see
 * a generic "Failed to fetch" with zero information, while the skill_runs
 * row (written incrementally via logStep as the handler progressed) sat
 * frozen at "running" forever, because the code that would've called
 * finishRun() never got the chance to execute.
 *
 * This function is the fix: everything from here down now runs inside the
 * same Inngest-backed worker every other skill (pile-on, win-back,
 * pre-call-read, leak-map) already uses — see src/inngest/skill.ts —
 * immune to any single HTTP request's timeout, checkpointed so a crash
 * mid-run resumes from the last completed phase instead of from scratch,
 * and visible in Live Executions the entire time either way.
 *
 * `tenant` is the engagements row as pre-seeded by the (now fast) setup
 * route: buyer/offerDetails/stack/topCallQuestions/rawVoiceCorpus are
 * already persisted with the buyer's raw form submission by the time this
 * runs. Booking/email/hosting credentials are NOT on this object — they're
 * already encrypted in credentials_refs by the time the route handed off,
 * and get re-resolved here via resolveCredential(), the same pattern
 * brief-service.ts uses. This deliberately mirrors src/lib/inngest.ts's
 * existing rule about never shipping secrets through an Inngest event
 * payload.
 */
export async function runPinDownOnboarding(
  tenant: any,
  runId: string,
  step?: StepTools
): Promise<void> {
  const summary = emptySummary();
  const run = step
    ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn)
    : <T,>(_id: string, fn: () => Promise<T>) => fn();

  const engagementId = tenant.engagementId;
  const buyerName = tenant.buyer;
  const offerDetails = tenant.offerDetails ?? {};
  const topCallQuestions: string[] = tenant.topCallQuestions ?? [];
  const topObjections: string[] = tenant.topObjections ?? [];
  const prospectMeets: string = tenant.prospectMeets ?? "founder";
  const existingProof = tenant.existingProof;
  const rawVoiceCorpus: string = tenant.rawVoiceCorpus ?? "";

  try {
    let finalStack = { ...(tenant.stack ?? {}) };

    // ── Email/CRM config completeness check ─────────────────────────────
    // Moved here from the setup route: the route no longer owns a summary
    // object (see the fast-handoff comment on that route), and this check
    // is pure inspection of already-persisted config, not something that
    // needs to block or slow down the initial response.
    if (finalStack.email_platform === "klaviyo" && (!finalStack.target_list_id || !finalStack.recovery_list_id)) {
      summary.openItems.push(
        "Klaviyo is missing a target and/or recovery list ID — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }
    if (
      finalStack.email_platform === "activecampaign" &&
      (!finalStack.target_list_id || !finalStack.recovery_list_id || !finalStack.activecampaign_base_url)
    ) {
      summary.openItems.push(
        "ActiveCampaign is missing a target list ID, recovery list ID, and/or base URL — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }
    if (
      finalStack.email_platform === "ghl" &&
      (!finalStack.booking_platform_meta?.location_id ||
        !finalStack.booking_platform_meta?.target_workflow_id ||
        !finalStack.booking_platform_meta?.recovery_workflow_id)
    ) {
      summary.openItems.push(
        "GoHighLevel is missing a location ID and/or workflow IDs — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }

    const bookingCredential = finalStack.booking_platform
      ? await resolveCredential(engagementId, finalStack.booking_platform).catch(() => null)
      : null;
    const hostingCredential = finalStack.hosting_platform
      ? await resolveCredential(engagementId, finalStack.hosting_platform).catch(() => null)
      : null;

    // ── Zero-config auto-discovery layer ──────────────────────────────────
    if (finalStack.booking_platform === "calendly" && bookingCredential) {
      finalStack = await run("calendly-discovery", async () => {
        const stack = { ...finalStack };
        try {
          const calendlyClient = new CalendlyClient(bookingCredential);
          const resolvedOrgUri = await calendlyClient.getCurrentOrganization();
          stack.booking_platform_meta = {
            ...stack.booking_platform_meta,
            organization_uri: resolvedOrgUri,
          };
          console.log(`[pin-down onboarding] Auto-discovered Calendly org URI: ${resolvedOrgUri}`);

          if (stack.booking_standing_link) {
            const resolvedUuid = await calendlyClient.getEventTypeUuidFromSlug(
              resolvedOrgUri,
              stack.booking_standing_link
            );
            if (resolvedUuid) {
              stack.booking_platform_meta.event_type_uuid = resolvedUuid;
              console.log(`[pin-down onboarding] Auto-discovered Calendly event type UUID: ${resolvedUuid}`);
            } else {
              summary.openItems.push(
                `Could not auto-detect the Calendly event type from the standing link "${stack.booking_standing_link}". Webhook registration may require manual configuration.`
              );
            }
          }
        } catch (discoveryErr: any) {
          console.error("[pin-down onboarding] Calendly metadata auto-discovery warning:", discoveryErr.message);
          summary.openItems.push(`Calendly metadata auto-discovery notice: ${discoveryErr.message}`);
        }
        return stack;
      });
    }

    if (finalStack.booking_platform === "cal_com" && bookingCredential && finalStack.booking_standing_link) {
      finalStack = await run("cal-com-discovery", async () => {
        const stack = { ...finalStack };
        try {
          console.log("[pin-down onboarding] Auto-discovering Cal.com profile metadata...");
          const calComClient = new CalComClient(bookingCredential);
          const resolvedMeta = await calComClient.resolveEventMetaFromLink(stack.booking_standing_link);
          stack.booking_platform_meta = {
            ...stack.booking_platform_meta,
            username: resolvedMeta.username,
            cal_event_type_id: resolvedMeta.cal_event_type_id,
          };
          console.log(
            `[pin-down onboarding] Auto-discovered Cal.com profile: "${resolvedMeta.username}" (ID: ${resolvedMeta.cal_event_type_id || "not found"})`
          );
          if (!resolvedMeta.cal_event_type_id) {
            summary.openItems.push(
              `Could not map a Cal.com event type ID to the link "${stack.booking_standing_link}". Lookahead slot pre-fetching will fall back to standard links.`
            );
          }
        } catch (calComErr: any) {
          console.error("[pin-down onboarding] Cal.com auto-discovery notice:", calComErr.message);
          summary.openItems.push(`Cal.com auto-discovery notice: ${calComErr.message}`);
        }
        return stack;
      });
    }

    // ── Voice extraction ───────────────────────────────────────────────────
    const voiceProfile = await run("voice-extraction", async () => {
      await logStep(runId, { phase: "voice_extraction", status: "running" });
      const profile = await extractVoiceProfile(rawVoiceCorpus, runId);
      const corpusWordCount = rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
      summary.whatWasAttempted.push(`Extracted brand voice profile from a ${corpusWordCount}-word corpus.`);
      if (profile?.source_path === "scrape") {
        summary.whatWorked.push("Brand voice profile extracted from buyer-supplied corpus via Claude.");
      } else {
        summary.whatWorked.push("Brand voice profile set to neutral default (corpus under 500 words).");
        summary.openItems.push("Corpus was too short for a real voice extraction — using the operator-grade default tone.");
      }
      await logStep(runId, {
        phase: "voice_extraction",
        status: "success",
        detail: profile?.source_path === "scrape" ? "Tone profile extracted from corpus" : "Neutral default tone applied",
      });
      return profile;
    });

    // ── Ad creative briefs ──────────────────────────────────────────────────
    // One structured brief per content pillar, generated once here rather
    // than in Pile-On itself — Pile-On doesn't have its own setup phase to
    // run this from, and the copy doesn't need per-booking variation, same
    // reasoning as generating the recovery cadence once during Win-Back
    // setup rather than per-prospect. Failure here is non-fatal to the rest
    // of onboarding: a missing set of ad briefs shouldn't block bookings
    // from working.
    try {
      await logStep(runId, { phase: "ad_creative_briefs", status: "running" });
      const { briefs } = await run("ad-creative-briefs", () =>
        buildAdCreativeBriefs(
          {
            buyer: buyerName,
            brandVoiceProfile: voiceProfile,
            offerDetails,
            topCallQuestions,
            topObjections,
            existingProof,
          },
          runId
        )
      );
      await db
        .update(engagements)
        .set({ adCreativeBriefs: { generatedAt: new Date().toISOString(), briefs } })
        .where(eq(engagements.engagementId, engagementId));
      summary.whatWorked.push(`Generated ${briefs.length} ad creative briefs across all 4 content pillars.`);
      await logStep(runId, {
        phase: "ad_creative_briefs",
        status: "success",
        detail: `${briefs.length} briefs generated`,
      });
    } catch (e: any) {
      console.error("[pin-down onboarding] Ad creative brief generation failed:", e.message);
      summary.openItems.push(`Ad creative briefs couldn't be generated: ${e.message}`);
      await logStep(runId, { phase: "ad_creative_briefs", status: "failed", detail: e.message });
    }

    // ── Confirmation page deploy ────────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.muddventures.com";
    const internalFallbackUrl = `${appUrl}/confirm/${engagementId}`;

    const { confirmationPageUrl, confirmationPageDeployment, pasteReadyHtml, pasteReadyInstructions } = await run(
      "confirmation-deploy",
      async () => {
        await logStep(runId, { phase: "confirmation_page_deploy", status: "running" });

        const pageContent = buildConfirmationPageHtml({
          buyer: buyerName,
          offerDetails,
          brandVoiceProfile: voiceProfile,
          topCallQuestions,
          prospectMeets,
          existingProof,
        });

        const deployResult = await publishConfirmationPage(
          finalStack.hosting_platform,
          hostingCredential,
          finalStack.hosting_platform_meta,
          pageContent,
          engagementId
        );

        if (deployResult.mode === "live") {
          summary.whatWorked.push(
            `Confirmation page published live on the buyer's own ${finalStack.hosting_platform} at ${deployResult.url}.`
          );
          await logStep(runId, {
            phase: "confirmation_page_deploy",
            status: "success",
            detail: `Live on buyer's ${finalStack.hosting_platform}: ${deployResult.url}`,
          });
          return {
            confirmationPageUrl: deployResult.url,
            confirmationPageDeployment: {
              mode: "live" as const,
              deployedVia: deployResult.deployedVia,
              lastAttemptedAt: new Date().toISOString(),
            },
            pasteReadyHtml: null as string | null,
            pasteReadyInstructions: null as string | null,
          };
        }

        summary.whatFailed.push(`Could not auto-publish to ${finalStack.hosting_platform}: ${deployResult.reason}`);
        summary.openItems.push(
          `[needs:manual-page-publish] Paste-ready HTML and instructions are ready for ${finalStack.hosting_platform} — the buyer needs to publish it manually. Using the internal preview page at ${internalFallbackUrl} until then.`
        );
        await logStep(runId, {
          phase: "confirmation_page_deploy",
          status: "failed",
          detail: deployResult.reason,
        });
        return {
          confirmationPageUrl: internalFallbackUrl,
          confirmationPageDeployment: {
            mode: "paste_ready" as const,
            reason: deployResult.reason,
            lastAttemptedAt: new Date().toISOString(),
          },
          pasteReadyHtml: deployResult.html,
          pasteReadyInstructions: deployResult.instructions,
        };
      }
    );

    // ── Final engagement upsert ─────────────────────────────────────────────
    await run("engagement-upsert", async () => {
      await logStep(runId, { phase: "engagement_upsert", status: "running" });

      await db
        .update(engagements)
        .set({
          stack: finalStack,
          brandVoiceProfile: voiceProfile,
          confirmationPageUrl,
          confirmationPageDeployment,
          pasteReadyHtml,
          pasteReadyInstructions,
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));

      summary.whatWasAttempted.push(`Created confirmation page at ${confirmationPageUrl}.`);
      summary.whatWorked.push("Engagement record updated in Postgres.");
      await logStep(runId, {
        phase: "engagement_upsert",
        status: "success",
        detail: `Engagement row finalized for ${buyerName}`,
      });
    });

    // ── Webhook registration ────────────────────────────────────────────────
    if (bookingCredential) {
      await run("webhook-registration", async () => {
        await logStep(runId, { phase: "webhook_registration", status: "running" });
        const receiverUrl = `${appUrl}/api/webhooks/booking-event?engagement_id=${engagementId}`;
        summary.whatWasAttempted.push(`Registered ${finalStack.booking_platform} webhook → ${receiverUrl}.`);
        try {
          const subscriptionId = await registerWebhookForTenant(
            finalStack.booking_platform,
            bookingCredential,
            receiverUrl,
            finalStack.booking_platform_meta
          );

          if (subscriptionId) {
            await db
              .update(engagements)
              .set({
                stack: { ...finalStack, webhook_subscription_id: subscriptionId as string },
                updatedAt: new Date(),
              })
              .where(eq(engagements.engagementId, engagementId));
            summary.whatWorked.push(`${finalStack.booking_platform} webhook registered (subscription ${subscriptionId}).`);
            await logStep(runId, {
              phase: "webhook_registration",
              status: "success",
              detail: `Subscription ${subscriptionId}`,
            });
          } else {
            summary.openItems.push(
              `${finalStack.booking_platform} webhook registration returned no subscription ID — bookings may need manual verification.`
            );
            await logStep(runId, { phase: "webhook_registration", status: "skipped", detail: "No subscription ID returned" });
          }
        } catch (e: any) {
          console.error(`[pin-down onboarding] Webhook registration failed: ${e.message}`);
          summary.whatFailed.push(`${finalStack.booking_platform} webhook registration failed: ${e.message}`);
          summary.openItems.push("Booking webhook is not connected — Pile-On and Win-Back won't fire automatically until this is fixed.");
          await logStep(runId, { phase: "webhook_registration", status: "failed", detail: e.message });
        }
      });
    } else {
      await logStep(runId, { phase: "webhook_registration", status: "skipped", detail: "No booking credentials available" });
    }

    // ── Post-booking redirect config (Calendly only) ────────────────────────
    if (
      finalStack.booking_platform === "calendly" &&
      bookingCredential &&
      finalStack.booking_platform_meta?.event_type_uuid
    ) {
      await run("redirect-config", async () => {
        await logStep(runId, { phase: "redirect_config", status: "running" });
        summary.whatWasAttempted.push(`Configured Calendly redirect for event type ${finalStack.booking_platform_meta.event_type_uuid}.`);
        try {
          const calendlyClient = new CalendlyClient(bookingCredential);
          await calendlyClient.configurePostBookingRedirect(
            finalStack.booking_platform_meta.event_type_uuid,
            confirmationPageUrl
          );
          summary.whatWorked.push("Calendly post-booking redirect configured.");
          await logStep(runId, { phase: "redirect_config", status: "success" });
        } catch (e: any) {
          console.error(`[pin-down onboarding] Calendly redirect config failed: ${e.message}`);
          summary.whatFailed.push(`Calendly redirect configuration failed: ${e.message}`);
          summary.openItems.push("Calendly isn't redirecting to the confirmation page yet — set this manually or re-run setup.");
          await logStep(runId, { phase: "redirect_config", status: "failed", detail: e.message });
        }
      });
    } else {
      await logStep(runId, {
        phase: "redirect_config",
        status: "skipped",
        detail: !finalStack.booking_platform_meta?.event_type_uuid
          ? "No event type UUID available (auto-discovery may have failed or no standing link provided)"
          : "Not applicable for this booking platform",
      });
    }

    summary.decisionsMade.push(
      `Brief landing destination: ${finalStack.brief_landing_destination ?? "slack"} (${finalStack.slack_webhook_url ? "webhook configured" : "default"}).`
    );

    await finishRun(runId, { summary });
  } catch (error: any) {
    console.error("[pin-down onboarding]", error.message);
    summary.whatFailed.push(error.message);
    await failRun(runId, error, { summary });
    throw error; // let Inngest's retry policy / the worker's own safety net decide
  }
}
