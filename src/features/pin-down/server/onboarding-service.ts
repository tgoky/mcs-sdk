import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { registerWebhookForTenant, CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { publishConfirmationPage } from "@/lib/platforms/hosting";
import { buildConfirmationPageHtml } from "./page-builder";
import { buildAdCreativeBriefs } from "@/features/pile-on/server/ad-creative-briefs";
import { buildScriptPack } from "./script-builder";
import { auditExistingConfirmationPage } from "./discovery-prefill";
import { createPlatformAdapterDraft } from "./doc-researcher";
import { scrapeVoiceCorpus, scrapeEspBroadcasts } from "./voice-scraper";
import { buildSmsSequence } from "@/features/pile-on/server/sms-sequence-builder";
import { auditExistingPileOnSequence } from "@/features/pile-on/server/existing-sequence-builder";
import { auditExistingReport } from "@/features/leak-map/server/existing-audit-audit";
import { activateNotificationPackAlert } from "@/features/leak-map/server/notification-pack";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

async function extractVoiceProfile(corpus: string, runId: string): Promise<any> {
  const wordCount = corpus.trim().split(/\s+/).filter(Boolean).length;

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
    parsed.source_path = "ai_extracted";
  } catch {
    parsed = { source_path: "default" };
  }
  return parsed;
}

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
  const castingChoice = (tenant.castingChoice ?? "founder_on_camera") as
    | "founder_on_camera"
    | "coach_on_camera"
    | "animation"
    | "other";
  const existingProof = tenant.existingProof;
  const rawVoiceCorpus: string = tenant.rawVoiceCorpus ?? "";

  try {
    let finalStack = { ...(tenant.stack ?? {}) };

    // ── Email/CRM config completeness check ─────────────────────────────
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
        !finalStack.target_workflow_id ||
        !finalStack.recovery_workflow_id)
    ) {
      summary.openItems.push(
        "GoHighLevel is missing a location ID and/or workflow IDs — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }
    if (finalStack.email_platform === "mailchimp" && (!finalStack.target_list_id || !finalStack.recovery_list_id)) {
      summary.openItems.push(
        "Mailchimp is missing a target and/or recovery audience ID — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }
    if (finalStack.email_platform === "convertkit" && (!finalStack.target_list_id || !finalStack.recovery_list_id)) {
      summary.openItems.push(
        "ConvertKit is missing a target form ID and/or recovery tag ID — Pile-On and Win-Back enrollment will fail until these are set."
      );
    }
    if (finalStack.email_platform === "smtp") {
      summary.openItems.push(
        "SMTP is a direct-send channel with no app-generated Pile-On pre-call content yet — it will only run the Win-Back recovery email cadence, not Pile-On."
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
      const discoveryResult = await run("calendly-discovery", async () => {
        const stack = { ...finalStack };
        let openItem: string | undefined;
        try {
          const calendlyClient = new CalendlyClient(bookingCredential);
          const resolvedOrgUri = await calendlyClient.getCurrentOrganization();
          stack.booking_platform_meta = {
            ...stack.booking_platform_meta,
            organization_uri: resolvedOrgUri,
          };

          if (stack.booking_standing_link) {
            const resolvedUuid = await calendlyClient.getEventTypeUuidFromSlug(
              resolvedOrgUri,
              stack.booking_standing_link
            );
            if (resolvedUuid) {
              stack.booking_platform_meta.event_type_uuid = resolvedUuid;
            } else {
              openItem = `Could not auto-detect the Calendly event type from the standing link "${stack.booking_standing_link}". Webhook registration may require manual configuration.`;
            }
          }
        } catch (discoveryErr: any) {
          console.error("[pin-down onboarding] Calendly metadata auto-discovery warning:", discoveryErr.message);
          openItem = `Calendly metadata auto-discovery notice: ${discoveryErr.message}`;
        }
        return { stack, openItem };
      });

      finalStack = discoveryResult.stack;
      if (discoveryResult.openItem) {
        summary.openItems.push(discoveryResult.openItem);
      }
    }

    if (finalStack.booking_platform === "cal_com" && bookingCredential && finalStack.booking_standing_link) {
      const calResult = await run("cal-com-discovery", async () => {
        const stack = { ...finalStack };
        let openItem: string | undefined;
        try {
          const calComClient = new CalComClient(bookingCredential);
          const resolvedMeta = await calComClient.resolveEventMetaFromLink(stack.booking_standing_link);
          stack.booking_platform_meta = {
            ...stack.booking_platform_meta,
            username: resolvedMeta.username,
            cal_event_type_id: resolvedMeta.cal_event_type_id,
          };
          if (!resolvedMeta.cal_event_type_id) {
            openItem = `Could not map a Cal.com event type ID to the link "${stack.booking_standing_link}". Lookahead slot pre-fetching will fall back to standard links.`;
          }
        } catch (calComErr: any) {
          console.error("[pin-down onboarding] Cal.com auto-discovery notice:", calComErr.message);
          openItem = `Cal.com auto-discovery notice: ${calComErr.message}`;
        }
        return { stack, openItem };
      });

      finalStack = calResult.stack;
      if (calResult.openItem) {
        summary.openItems.push(calResult.openItem);
      }
    }

    // ── Auto-doc-research for unlisted platforms ──────────────────────────
    for (const [kind, platformValue, discoveredName, discoveredUrl] of [
      ["hosting", finalStack.hosting_platform, finalStack.discovered_platform_name, finalStack.discovered_platform_website],
      ["booking", finalStack.booking_platform, finalStack.discovered_platform_name, finalStack.discovered_platform_website],
    ] as const) {
      if (platformValue !== "discover_from_docs") continue;
      const platformName = discoveredName ?? "Unnamed platform";
      try {
        await logStep(runId, { phase: `doc_research_${kind}`, status: "running", label: platformName });
        const draftId = await run(`doc-research-${kind}`, () =>
          createPlatformAdapterDraft(engagementId, kind, platformName, discoveredUrl)
        );
        summary.openItems.push(
          `${kind === "hosting" ? "Hosting" : "Booking"} platform "${platformName}" isn't in the built-in set — researched its docs and drafted an adapter proposal (id: ${draftId}) pending admin review.`
        );
        await logStep(runId, { phase: `doc_research_${kind}`, status: "success", detail: `Draft ${draftId} created, pending_review` });
      } catch (e: any) {
        console.error(`[pin-down onboarding] Doc research for ${platformName} (${kind}) failed:`, e.message);
        summary.openItems.push(`Doc research for "${platformName}" (${kind}) failed: ${e.message}`);
        await logStep(runId, { phase: `doc_research_${kind}`, status: "failed", detail: e.message });
      }
    }

    // ── Voice scrape ───────────────────────────────────────────────────────
    let combinedVoiceCorpus = rawVoiceCorpus;
    if (finalStack.buyer_domain) {
      const scrapeResult = await run("voice-scrape", async () => {
        await logStep(runId, { phase: "voice_scrape", status: "running" });
        try {
          const { corpus: scrapedCorpus, sources } = await scrapeVoiceCorpus(finalStack.buyer_domain!);
          let espSources: Array<{ text: string; wordCount: number }> = [];
          if (finalStack.email_platform) {
            const emailCred = await resolveCredential(engagementId, finalStack.email_platform).catch(() => null);
            espSources = await scrapeEspBroadcasts(finalStack.email_platform, emailCred ?? undefined);
          }
          const allText = [scrapedCorpus, ...espSources.map((s) => s.text)].filter(Boolean).join("\n\n---\n\n");
          
          let resultCorpus = rawVoiceCorpus;
          if (allText) {
            resultCorpus = [rawVoiceCorpus, allText].filter(Boolean).join("\n\n---\n\n");
          }

          const artifactSources = [
            ...sources.map((s) => ({ kind: s.kind, url: s.url, wordCount: s.wordCount })),
            ...espSources.map((s) => ({ kind: "esp_broadcast" as const, wordCount: s.wordCount })),
          ];

          await db
            .update(engagements)
            .set({
              voiceScrapeArtifacts: {
                scrapedAt: new Date().toISOString(),
                sources: artifactSources,
                totalWordCount: artifactSources.reduce((sum, s) => sum + s.wordCount, 0),
              },
            })
            .where(eq(engagements.engagementId, engagementId));

          await logStep(runId, {
            phase: "voice_scrape",
            status: artifactSources.length > 0 ? "success" : "skipped",
            detail: `${artifactSources.length} source(s) pulled`,
          });

          return {
            combinedCorpus: resultCorpus,
            sourcesCount: artifactSources.length,
            sourceKinds: artifactSources.map((s) => s.kind),
          };
        } catch (e: any) {
          console.error("[pin-down onboarding] Voice scrape failed (non-fatal):", e.message);
          await logStep(runId, { phase: "voice_scrape", status: "failed", detail: e.message });
          return {
            combinedCorpus: rawVoiceCorpus,
            sourcesCount: 0,
            sourceKinds: [],
            error: e.message,
          };
        }
      });

      combinedVoiceCorpus = scrapeResult.combinedCorpus;

      if (scrapeResult.error) {
        summary.openItems.push(`Voice crawl of ${finalStack.buyer_domain} failed: ${scrapeResult.error} — continuing with the operator-pasted corpus.`);
      } else if (scrapeResult.sourcesCount > 0) {
        summary.whatWorked.push(
          `Crawled ${scrapeResult.sourcesCount} source(s) (${scrapeResult.sourceKinds.join(", ")}) from ${finalStack.buyer_domain} for voice extraction.`
        );
      } else {
        summary.openItems.push(`Voice crawl of ${finalStack.buyer_domain} found nothing usable — voice extraction will rely on the operator-pasted corpus alone.`);
      }
    } else {
      await logStep(runId, { phase: "voice_scrape", status: "skipped", detail: "No buyer_domain on file" });
    }

    // ── Voice extraction ───────────────────────────────────────────────────
    const voiceProfile = await run("voice-extraction", async () => {
      await logStep(runId, { phase: "voice_extraction", status: "running" });
      const profile = await extractVoiceProfile(combinedVoiceCorpus, runId);
      
      const isAiExtracted = profile?.source_path === "ai_extracted";
      await logStep(runId, {
        phase: "voice_extraction",
        status: "success",
        detail: isAiExtracted ? "Tone profile extracted from corpus" : "Neutral default tone applied",
      });
      return profile;
    });

    const isAiExtracted = voiceProfile?.source_path === "ai_extracted";
    const corpusWordCount = combinedVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
    summary.whatWasAttempted.push(`Extracted brand voice profile from a ${corpusWordCount}-word corpus.`);
    if (isAiExtracted) {
      summary.whatWorked.push("Brand voice profile extracted from buyer-supplied corpus via Claude.");
    } else {
      summary.whatWorked.push("Brand voice profile set to neutral default (corpus under 500 words).");
      summary.openItems.push("Corpus was too short for a real voice extraction — using the operator-grade default tone.");
    }

    // ── Ad creative briefs ──────────────────────────────────────────────────
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

    // ── Hero + breakout video scripts ───────────────────────────────────────
    try {
      await logStep(runId, { phase: "script_pack", status: "running" });
      const scriptPack = await run("script-pack", () =>
        buildScriptPack(
          {
            buyer: buyerName,
            brandVoiceProfile: voiceProfile,
            offerDetails,
            topCallQuestions,
            prospectMeets,
            existingProof,
            castingChoice,
          },
          runId
        )
      );
      await db
        .update(engagements)
        .set({
          pinDownScriptPack: {
            generatedAt: new Date().toISOString(),
            heroScript: scriptPack.heroScript,
            breakoutScripts: scriptPack.breakoutScripts,
            recordingChecklist: scriptPack.recordingChecklist,
          },
        })
        .where(eq(engagements.engagementId, engagementId));
      summary.whatWorked.push(
        `Generated a hero video script (${scriptPack.heroScript.chapters.length} chapters) and ${scriptPack.breakoutScripts.length} breakout scripts.`
      );
      await logStep(runId, {
        phase: "script_pack",
        status: "success",
        detail: `Hero + ${scriptPack.breakoutScripts.length} breakout scripts generated`,
      });
    } catch (e: any) {
      console.error("[pin-down onboarding] Script pack generation failed:", e.message);
      summary.openItems.push(`Hero/breakout video scripts couldn't be generated: ${e.message}`);
      await logStep(runId, { phase: "script_pack", status: "failed", detail: e.message });
    }

    // ── SMS sequence content ────────────────────────────────────────────────
    if (finalStack.sms_platform && finalStack.sms_platform !== "none") {
      try {
        await logStep(runId, { phase: "sms_sequence", status: "running" });
        const smsMessages = await run("sms-sequence", () =>
          buildSmsSequence(
            {
              buyer: buyerName,
              brandVoiceProfile: voiceProfile,
              offerDetails,
              topObjections,
              complianceFooterVariant: finalStack.sms_compliance_footer_variant,
              complianceFooterCustom: finalStack.sms_compliance_footer_custom,
            },
            runId
          )
        );
        await db
          .update(engagements)
          .set({ pileOnSmsAssetMap: { generatedAt: new Date().toISOString(), messages: smsMessages } })
          .where(eq(engagements.engagementId, engagementId));
        summary.whatWorked.push(`Generated a ${smsMessages.length}-message SMS sequence for ${finalStack.sms_platform}.`);
        await logStep(runId, { phase: "sms_sequence", status: "success", detail: `${smsMessages.length} messages generated` });
      } catch (e: any) {
        console.error("[pin-down onboarding] SMS sequence generation failed:", e.message);
        summary.openItems.push(`SMS sequence couldn't be generated: ${e.message}`);
        await logStep(runId, { phase: "sms_sequence", status: "failed", detail: e.message });
      }
    }

    // ── Existing Pile-On sequence audit ─────────────────────────────────────
    if (finalStack.existing_pile_on_sequence_flagged && finalStack.email_platform) {
      try {
        await logStep(runId, { phase: "pile_on_sequence_audit", status: "running" });
        const emailApiKey = await resolveCredential(engagementId, finalStack.email_platform).catch(() => null);
        if (!emailApiKey) {
          summary.openItems.push("Existing Pile-On sequence audit skipped — no email platform credential resolved yet.");
          await logStep(runId, { phase: "pile_on_sequence_audit", status: "skipped", detail: "No credential" });
        } else {
          const audit = await run("pile-on-sequence-audit", () =>
            auditExistingPileOnSequence(finalStack.email_platform!, emailApiKey, { offerDetails, brandVoiceProfile: voiceProfile })
          );
          await db
            .update(engagements)
            .set({ pileOnExistingSequenceAudit: audit })
            .where(eq(engagements.engagementId, engagementId));
          if (audit.supported) {
            summary.whatWorked.push(
              `Audited existing Pile-On sequence on ${finalStack.email_platform} — ${audit.emails.length} email(s) scored.`
            );
            await logStep(runId, { phase: "pile_on_sequence_audit", status: "success", detail: `${audit.emails.length} emails scored` });
          } else {
            summary.openItems.push(`Existing Pile-On sequence audit: ${audit.unsupportedReason}`);
            await logStep(runId, { phase: "pile_on_sequence_audit", status: "skipped", detail: audit.unsupportedReason });
          }
        }
      } catch (e: any) {
        console.error("[pin-down onboarding] Pile-On sequence audit failed:", e.message);
        summary.openItems.push(`Existing Pile-On sequence audit failed: ${e.message}`);
        await logStep(runId, { phase: "pile_on_sequence_audit", status: "failed", detail: e.message });
      }
    }

    // ── Existing report/dashboard audit ────────────────────────────────────
    if (finalStack.existing_audit_flagged && finalStack.existing_audit_description) {
      try {
        await logStep(runId, { phase: "leak_map_existing_audit", status: "running" });
        const audit = await run("leak-map-existing-audit", () =>
          auditExistingReport(finalStack.existing_audit_description!)
        );
        await db
          .update(engagements)
          .set({ existingAuditAuditResult: audit })
          .where(eq(engagements.engagementId, engagementId));
        summary.whatWorked.push(
          `Compared existing report against Leak Map — ${audit.overlapping.length} overlapping area(s), ${audit.gapsLeakMapCloses.length} gap(s) closed.`
        );
        await logStep(runId, { phase: "leak_map_existing_audit", status: "success" });
      } catch (e: any) {
        console.error("[pin-down onboarding] Leak Map existing-audit audit failed:", e.message);
        summary.openItems.push(`Existing report audit failed: ${e.message}`);
        await logStep(runId, { phase: "leak_map_existing_audit", status: "failed", detail: e.message });
      }
    }

    // ── Notification pack activation ───────────────────────────────────────
    if (finalStack.notification_pack_selections && finalStack.notification_pack_selections.length > 0) {
      let activated = 0;
      for (const packAlertId of finalStack.notification_pack_selections) {
        try {
          await activateNotificationPackAlert(engagementId, packAlertId);
          activated++;
        } catch (e: any) {
          summary.openItems.push(`Couldn't activate notification pack alert "${packAlertId}": ${e.message}`);
        }
      }
      if (activated > 0) {
        summary.whatWorked.push(`Activated ${activated} notification pack alert(s) for Leak Map.`);
        await logStep(runId, { phase: "notification_pack_activation", status: "success", detail: `${activated} activated` });
      }
    }

    // ── Existing-page audit ────────────────────────────────────────────────
    if (finalStack.existing_confirmation_page_url) {
      try {
        await logStep(runId, { phase: "existing_page_audit", status: "running" });
        const audit = await run("existing-page-audit", () =>
          auditExistingConfirmationPage(finalStack.existing_confirmation_page_url!, {
            buyer: buyerName,
            offerDetails,
            brandVoiceProfile: voiceProfile,
          })
        );
        await db
          .update(engagements)
          .set({ pinDownPageAudit: audit })
          .where(eq(engagements.engagementId, engagementId));
        summary.whatWorked.push(
          `Audited existing confirmation page at ${finalStack.existing_confirmation_page_url} — ${audit.existingPageWeaknesses.length} gap(s) identified.`
        );
        await logStep(runId, {
          phase: "existing_page_audit",
          status: "success",
          detail: `${audit.existingPageStrengths.length} strengths, ${audit.existingPageWeaknesses.length} weaknesses noted`,
        });
      } catch (e: any) {
        console.error("[pin-down onboarding] Existing-page audit failed:", e.message);
        summary.openItems.push(`Existing-page audit failed: ${e.message}`);
        await logStep(runId, { phase: "existing_page_audit", status: "failed", detail: e.message });
      }
    }

    // ── Confirmation page deploy ────────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
    const internalFallbackUrl = `${appUrl}/confirm/${engagementId}`;

    const { confirmationPageUrl, confirmationPageDeployment, pasteReadyHtml, pasteReadyInstructions, remoteResourceId } = await run(
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
            remoteResourceId: deployResult.resourceId ?? (null as string | number | null),
          };
        }

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
          remoteResourceId: null as string | number | null,
        };
      }
    );

    if (confirmationPageDeployment.mode === "live") {
      summary.whatWorked.push(`Confirmation page published live on ${finalStack.hosting_platform} at ${confirmationPageUrl}.`);
    } else {
      summary.whatFailed.push(`Could not auto-publish to ${finalStack.hosting_platform}: ${confirmationPageDeployment.reason}`);
      summary.openItems.push(`Paste-ready HTML ready for ${finalStack.hosting_platform} — manual publish required.`);
    }

    if (finalStack.hosting_platform === "wordpress" && confirmationPageDeployment.mode === "live" && remoteResourceId) {
      finalStack = {
        ...finalStack,
        hosting_platform_meta: {
          ...finalStack.hosting_platform_meta,
          wordpress_page_id: remoteResourceId as number,
        },
      };
    }

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

      await logStep(runId, {
        phase: "engagement_upsert",
        status: "success",
        detail: `Engagement row finalized for ${buyerName}`,
      });
    });

    summary.whatWasAttempted.push(`Created confirmation page at ${confirmationPageUrl}.`);
    summary.whatWorked.push("Engagement record updated in Postgres.");

    // ── Webhook registration (FIXED: State returned & summary pushed outside) ─
    if (bookingCredential) {
      const webhookResult = await run("webhook-registration", async () => {
        await logStep(runId, { phase: "webhook_registration", status: "running" });
        const receiverUrl = `${appUrl}/api/webhooks/booking-event?engagement_id=${engagementId}`;
        try {
          const subscriptionResult = await registerWebhookForTenant(
            finalStack.booking_platform,
            bookingCredential,
            receiverUrl,
            finalStack.booking_platform_meta
          );

          const isObjectResult = typeof subscriptionResult === 'object' && subscriptionResult !== null;
          const subId = isObjectResult ? (subscriptionResult as any).uri : subscriptionResult;
          const signingKey = isObjectResult ? (subscriptionResult as any).signingKey : null;

          if (subId) {
            await db
              .update(engagements)
              .set({
                stack: { 
                  ...finalStack, 
                  webhook_subscription_id: subId as string, 
                  ...(signingKey ? { webhook_signing_secret: signingKey as string } : {}),
                  webhook_receiver_mode: "webhook" 
                },
                updatedAt: new Date(),
              })
              .where(eq(engagements.engagementId, engagementId));
            await logStep(runId, {
              phase: "webhook_registration",
              status: "success",
              detail: `Subscription ${subId}`,
            });
            return { mode: "webhook" as const, subId: subId as string, receiverUrl };
          } else {
            await db
              .update(engagements)
              .set({
                stack: {
                  ...finalStack,
                  webhook_receiver_mode: "polling",
                  webhook_poll_interval_minutes: finalStack.webhook_poll_interval_minutes ?? 5,
                  webhook_receiver_last_polled_at: new Date().toISOString(),
                },
                updatedAt: new Date(),
              })
              .where(eq(engagements.engagementId, engagementId));
            await logStep(runId, { phase: "webhook_registration", status: "skipped", detail: "No subscription ID returned — fell back to polling mode" });
            return { mode: "polling" as const, reason: "no_sub_id", receiverUrl, isError: false };
          }
        } catch (e: any) {
          console.error(`[pin-down onboarding] Webhook registration failed: ${e.message}`);
          await db
            .update(engagements)
            .set({
              stack: {
                ...finalStack,
                webhook_receiver_mode: "polling",
                webhook_poll_interval_minutes: finalStack.webhook_poll_interval_minutes ?? 5,
                webhook_receiver_last_polled_at: new Date().toISOString(),
              },
              updatedAt: new Date(),
            })
            .where(eq(engagements.engagementId, engagementId));
          await logStep(runId, { phase: "webhook_registration", status: "failed", detail: `${e.message} — fell back to polling mode` });
          return { mode: "polling" as const, reason: e.message, receiverUrl, isError: true };
        }
      });

      summary.whatWasAttempted.push(`Registered ${finalStack.booking_platform} webhook → ${webhookResult.receiverUrl}.`);
      if (webhookResult.mode === "webhook") {
        summary.whatWorked.push(`${finalStack.booking_platform} webhook registered (subscription ${webhookResult.subId}).`);
      } else if (webhookResult.isError) {
        summary.whatFailed.push(`${finalStack.booking_platform} webhook registration failed: ${webhookResult.reason}`);
        summary.openItems.push(
          `Booking webhook registration failed — switched to polling every ${finalStack.webhook_poll_interval_minutes ?? 5} minute(s) as a fallback so bookings still process.`
        );
      } else {
        summary.openItems.push(
          `${finalStack.booking_platform} doesn't support live webhook registration — switched to polling every ${finalStack.webhook_poll_interval_minutes ?? 5} minute(s) instead. Bookings will process on a short delay rather than instantly.`
        );
      }
    } else {
      await logStep(runId, { phase: "webhook_registration", status: "skipped", detail: "No booking credentials available" });
    }

    // ── Post-booking redirect config (Calendly only) (FIXED: State returned & summary pushed outside) ─
    if (
      finalStack.booking_platform === "calendly" &&
      bookingCredential &&
      finalStack.booking_platform_meta?.event_type_uuid
    ) {
      const redirectResult = await run("redirect-config", async () => {
        await logStep(runId, { phase: "redirect_config", status: "running" });
        try {
          const calendlyClient = new CalendlyClient(bookingCredential);
          await calendlyClient.configurePostBookingRedirect(
            finalStack.booking_platform_meta.event_type_uuid,
            confirmationPageUrl
          );
          await logStep(runId, { phase: "redirect_config", status: "success" });
          return { success: true };
        } catch (e: any) {
          console.error(`[pin-down onboarding] Calendly redirect config failed: ${e.message}`);
          await logStep(runId, { phase: "redirect_config", status: "failed", detail: e.message });
          return { success: false, error: e.message };
        }
      });

      summary.whatWasAttempted.push(`Configured Calendly redirect for event type ${finalStack.booking_platform_meta.event_type_uuid}.`);
      if (redirectResult.success) {
        summary.whatWorked.push("Calendly post-booking redirect configured.");
      } else {
        summary.whatFailed.push(`Calendly redirect configuration failed: ${redirectResult.error}`);
        summary.openItems.push("Calendly isn't redirecting to the confirmation page yet — set this manually or re-run setup.");
      }
    } else {
      await logStep(runId, {
        phase: "redirect_config",
        status: "skipped",
        detail: !finalStack.booking_platform_meta?.event_type_uuid
          ? "No event type UUID available"
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
    throw error;
  }
}