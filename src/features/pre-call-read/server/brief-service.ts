import { db } from "@/lib/db";
import { briefedCallsLog, engagements } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { evaluatePersonMatch } from "../person-match";
import { researchProspect } from "./prospect-research";
import { runConfiguredEnrichment } from "./apollo-adapter";
import { resolveCredential } from "@/lib/credentials";
import { fetchTomorrowCallsForTenant, fetchUpcomingCallsForTenant, type NormalizedCall } from "@/lib/platforms/booking";
import { deliverBrief, KlaviyoClient } from "@/lib/platforms/email";
import { getVideoEngagementForProspect } from "@/lib/platforms/video-engagement";
import { getAdDataContextForTenant } from "@/lib/platforms/ad-data";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { inngest, prospectBriefDispatch } from "@/lib/inngest";
import crypto from "crypto";
import type { GetStepTools, Inngest } from "inngest";

// Loose type so this file doesn't need to import the concrete client type
// from src/lib/inngest.ts (would create a circular import: inngest.ts has
// no dependency on this file, but skill.ts imports both). `step` is
// optional — the stale-but-still-present cron path can call this directly
// without an Inngest step context; in that case we fall back to running
// the work inline with no checkpointing (same as the pre-refactor behavior).
type StepTools = GetStepTools<Inngest.Any>;

/**
 * Builds the 7-block brief system prompt.
 *
 * `engagementContext` bundles everything the transfer analysis's gaps 3
 * (video engagement), 4 (ad-data engagement), and 7 (Klaviyo profile
 * engagement) feed into the Engagement History section — pre-formatted
 * as prose fragments by the caller (see gatherEngagementContext below)
 * rather than raw objects, since this prompt is the single place all
 * three sources actually converge into the brief.
 */
function buildBriefSystemPrompt(tenant: any, researchSummary: string | null, engagementContext: string | null): string {
  return `You are the Pre-Call Read briefing engine for Showtime.
Synthesize a concise closer brief in exactly 7 sections. Format each section title in bold (no # headers).
Sections required:
**Prospect Overview** | **Company Context** | **Engagement History** | **Likely Objections** | **Recommended Opening** | **Red Flags** | **Conversation Notes**

Brand voice constraints: ${JSON.stringify(tenant.brandVoiceProfile ?? {})}
Known objections to address: ${JSON.stringify(tenant.topObjections ?? [])}
Known call questions: ${JSON.stringify(tenant.topCallQuestions ?? [])}

${
  researchSummary
    ? `Public research findings on this prospect (use these for Prospect Overview and Company Context — do not repeat verbatim, synthesize naturally, and never state something the research below didn't actually establish):\n${researchSummary}`
    : `If research was omitted due to low identity confidence, write "Research omitted — identity confidence below threshold" under Prospect Overview and leave Engagement History blank. Do not fabricate details.`
}

${
  engagementContext
    ? `Engagement history data for the "Engagement History" section (use exactly what's here — do not embellish, and note explicitly if a source found nothing rather than omitting it silently):\n${engagementContext}`
    : ""
}`;
}

/**
 * Pre-Call Read recovery gaps 3, 4, 7 — pulls whatever engagement signal
 * sources this engagement has configured and formats them as prose for
 * buildBriefSystemPrompt. Every source here is independently best-effort:
 * one source failing or finding nothing never blocks the others or the
 * brief itself, matching this file's existing soft-fail philosophy for
 * prospect research.
 */
async function gatherEngagementContext(
  tenant: any,
  stack: any,
  engagementId: string,
  prospectEmail: string
): Promise<string | null> {
  const fragments: string[] = [];

  // Gap 7 — getProfileEngagement existed in email.ts but was never called
  // from the brief path (the AI Architect Review's "criminally underused
  // asset" flag). Klaviyo-only today, matching where the function lives.
  if (stack.email_platform === "klaviyo") {
    try {
      const emailApiKey = await resolveCredential(engagementId, "klaviyo");
      // Pre-Call Read recovery gap 7 — scope to the buyer's Pile-On list/flow when known.
      const events = await new KlaviyoClient(emailApiKey).getProfileEngagement(prospectEmail, stack.target_list_id);
      if (events.length > 0) {
        fragments.push(
          `Pile-On email sequence engagement (Klaviyo): ${events.length} tracked open/click event(s) on file for this prospect's sequence.`
        );
      } else {
        fragments.push("Pile-On email sequence engagement (Klaviyo): no opens or clicks tracked yet.");
      }
    } catch (e: any) {
      fragments.push(`Pile-On email sequence engagement (Klaviyo): couldn't be retrieved (${e.message}).`);
    }
  }

  // Gap 3 — video engagement on the confirmation page video.
  if (stack.video_engagement_platform && stack.video_engagement_platform !== "none") {
    try {
      // Cleaned up the redundant conditional check
      const videoApiKey = await resolveCredential(engagementId, stack.video_engagement_platform);
      const summary = await getVideoEngagementForProspect(
        stack.video_engagement_platform,
        videoApiKey,
        stack.video_engagement_meta,
        stack.video_engagement_meta?.wistia_video_id ?? stack.hero_video_id,
        prospectEmail
      );
      if (summary.note) {
        fragments.push(`Confirmation-page video engagement (${stack.video_engagement_platform}): ${summary.note}`);
      } else if (summary.watched) {
        fragments.push(
          `Confirmation-page video engagement (${stack.video_engagement_platform}): watched ${summary.percentWatched ?? "an unknown"}%${summary.lastWatchedAt ? `, last watched ${summary.lastWatchedAt}` : ""}.`
        );
      } else {
        fragments.push(`Confirmation-page video engagement (${stack.video_engagement_platform}): not watched yet.`);
      }
    } catch (e: any) {
      fragments.push(`Confirmation-page video engagement (${stack.video_engagement_platform}): couldn't be retrieved (${e.message}).`);
    }
  }

  // Gap 4 — ad-data cohort/prior-touch context.
  if (stack.ad_data_platform && stack.ad_data_platform !== "none" && stack.ad_data_platform !== "native_crm") {
    try {
      const adDataApiKey = await resolveCredential(engagementId, stack.ad_data_platform);
      const context = await getAdDataContextForTenant(stack.ad_data_platform, adDataApiKey, prospectEmail);
      if (context.found) {
        fragments.push(
          `Ad-data attribution (${stack.ad_data_platform}): ${context.sourceAd ? `came in from "${context.sourceAd}"` : "attributed lead"}${
            context.touchCount ? `, ${context.touchCount} tracked touch(es)` : ""
          }${context.firstTouchAt ? `, first touch ${context.firstTouchAt}` : ""}.`
        );
      } else {
        fragments.push(`Ad-data attribution (${stack.ad_data_platform}): no attribution on file for this lead (likely organic/referral).`);
      }
    } catch (e: any) {
      fragments.push(`Ad-data attribution (${stack.ad_data_platform}): couldn't be retrieved (${e.message}).`);
    }
  }

  return fragments.length > 0 ? fragments.join("\n") : null;
}

/**
 * Result of running the full per-prospect pipeline (dup-check through
 * delivery) for exactly one call. Deliberately never thrown — every
 * failure mode is represented as data so the caller (whether that's the
 * in-process loop or processSingleProspectBrief below) can update
 * summary/deliveredCount uniformly regardless of which execution path
 * ran the pipeline.
 */
type CallOutcome =
  | { status: "duplicate_skipped"; callLabel: string }
  | { status: "delivered"; callLabel: string; researchAttempted: boolean; searchesUsed?: number; confidenceScore: number; destination: string }
  | { status: "failed"; callLabel: string; detail: string };

/**
 * The actual per-prospect pipeline: dup-check, rule14-gate,
 * research+enrichment, engagement-context, synthesis, delivery — same six
 * phases as before, extracted verbatim out of the roster loop so it can
 * run two different ways:
 *   1. In-process, sequentially, inside executeNightlyBriefingCycle's own
 *      loop — the fallback path when `step` is absent (see `run` below,
 *      same optional-step pattern used everywhere else in this file).
 *   2. As the body of processSingleProspectBrief, one call per Inngest
 *      function invocation, fanned out via step.invoke() in parallel —
 *      see executeNightlyBriefingCycle's roster-processing block.
 */
async function processSingleBriefCall(
  tenant: any,
  stack: any,
  runId: string,
  call: NormalizedCall & { callTime: Date },
  run: <T,>(id: string, fn: () => Promise<T>) => Promise<T>
): Promise<CallOutcome> {
  const callLabel = `${call.name} (${call.email})`;

  try {
    // ── Idempotency gate ──────────────────────────────────────────────
    const dup = await run(`dup-check-${call.id}`, async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await db
        .select({ id: briefedCallsLog.id })
        .from(briefedCallsLog)
        .where(
          and(
            eq(briefedCallsLog.callId, call.id),
            gte(briefedCallsLog.createdAt, oneDayAgo)
          )
        )
        .limit(1);
      return { alreadyBriefed: existing.length > 0 };
    });

    if (dup.alreadyBriefed) {
      await logStep(runId, { phase: "duplicate_check", status: "skipped", label: callLabel, detail: "Already briefed in the last 24h — skipped" });
      return { status: "duplicate_skipped", callLabel };
    }

    // ── Rule 14 identity gate ────────────────────────────────────────
    await logStep(runId, { phase: "rule_14_gate", status: "running", label: callLabel });

    const matchResult = await run(`rule14-gate-${call.id}`, () =>
      evaluatePersonMatch(
        { email: call.email, name: call.name, companySupplied: call.company, linkedInUrlFromApp: call.linkedInUrl },
        stack.person_match_confidence_threshold ?? 99
      )
    );

    await logStep(runId, {
      phase: "rule_14_gate",
      status: matchResult.passed ? "success" : "skipped",
      label: callLabel,
      detail: `Identity confidence ${matchResult.totalScore}/100${matchResult.passed ? "" : " — research omitted"}`,
    });

    // ── Prospect research + BYOK enrichment (memoized as ONE step) ────
    let researchSummary: string | null = null;
    let researchStatus: "completed" | "skipped_low_confidence" | "failed" = "skipped_low_confidence";
    let researchAttempted = false;
    let searchesUsed: number | undefined;

    if (matchResult.passed) {
      await logStep(runId, { phase: "prospect_research", status: "running", label: callLabel });
      try {
        const researchResult = await run(`research-${call.id}`, async () => {
          const research = await researchProspect(call.name, call.email, call.company, runId);
          let combinedSummary = research.summary;

          if (stack.prospect_research_sources_used?.length) {
            const [apolloKey, pdlKey] = await Promise.all([
              stack.prospect_research_sources_used.includes("apollo") && stack.apollo_credentials_ref
                ? resolveCredential(tenant.engagementId, "apollo").catch(() => undefined)
                : Promise.resolve(undefined),
              stack.prospect_research_sources_used.includes("pdl") && stack.pdl_credentials_ref
                ? resolveCredential(tenant.engagementId, "pdl").catch(() => undefined)
                : Promise.resolve(undefined),
            ]);
            const enrichments = await runConfiguredEnrichment(
              stack.prospect_research_sources_used,
              { apollo: apolloKey, pdl: pdlKey },
              call.email
            );
            if (enrichments.length > 0) {
              combinedSummary = [combinedSummary, ...enrichments.map((e) => `[${e.source}] ${e.summary}`)]
                .filter(Boolean)
                .join("\n");
            }
          }

          return {
            summary: combinedSummary,
            searchesUsed: research.searchesUsed,
            citedUrlCount: research.citedUrls.length,
          };
        });

        researchSummary = researchResult.summary;
        researchStatus = "completed";
        researchAttempted = true;
        searchesUsed = researchResult.searchesUsed;
        await logStep(runId, {
          phase: "prospect_research",
          status: researchResult.citedUrlCount > 0 ? "success" : "skipped",
          label: callLabel,
          detail:
            researchResult.citedUrlCount > 0
              ? `${researchResult.citedUrlCount} source(s) found`
              : "No usable public findings",
        });
      } catch (researchErr: any) {
        researchStatus = "failed";
        await logStep(runId, { phase: "prospect_research", status: "failed", label: callLabel, detail: researchErr.message });
      }
    } else {
      await logStep(runId, { phase: "prospect_research", status: "skipped", label: callLabel, detail: "Identity confidence below threshold" });
    }

    // ── Engagement context (gaps 3, 4, 7) ────────────────────────────
    const engagementContext = await run(`context-${call.id}`, () =>
      gatherEngagementContext(tenant, stack, tenant.engagementId, call.email)
    );

    // ── Brief synthesis ─────────────────────────────────────────────
    await logStep(runId, { phase: "brief_synthesis", status: "running", label: callLabel });

    const userMessage = `Compile brief for prospect:
Name: ${call.name}
Email: ${call.email}
Company: ${call.company}
Call time: ${call.callTime.toISOString()}
Identity confidence score: ${matchResult.totalScore}/100
Research omitted: ${!matchResult.passed}`;

    const llmResult = await run(`synthesize-${call.id}`, () =>
      callClaudeWithRetry({
        model: MODEL.SYNTHESIS,
        system: buildBriefSystemPrompt(tenant, researchSummary, engagementContext),
        userMessage,
        maxTokens: 1500,
        runId,
      })
    );

    await logStep(runId, { phase: "brief_synthesis", status: "success", label: callLabel, detail: "7-section brief generated" });

    // ── Delivery + log write (memoized as one unit) ───────────────────
    await logStep(runId, { phase: "delivery", status: "running", label: callLabel });

    await run(`deliver-${call.id}`, async () => {
      const emailProvider = stack.email_platform;
      const emailApiKey = emailProvider
        ? await resolveCredential(tenant.engagementId, emailProvider).catch(() => undefined)
        : undefined;

      await deliverBrief(
        stack.brief_landing_destination ?? "slack",
        llmResult.text,
        call.email,
        stack.slack_webhook_url,
        emailApiKey,
        stack.email_platform
          ? { platform: stack.email_platform, location_id: stack.booking_platform_meta?.location_id }
          : undefined
      );

      await db.insert(briefedCallsLog).values({
        id: crypto.randomUUID(),
        engagementId: tenant.engagementId,
        callId: call.id,
        callTime: call.callTime,
        prospectName: call.name,
        briefDeliveredAt: new Date(),
        destinationDelivered: stack.brief_landing_destination ?? "slack",
        personMatchScore: matchResult.totalScore,
        researchStatus,
        aiSynthesisStatus: "completed",
        createdAt: new Date(),
      });
    });

    await logStep(runId, {
      phase: "delivery",
      status: "success",
      label: callLabel,
      detail: `Brief sent via ${stack.brief_landing_destination ?? "slack"}`,
    });

    return {
      status: "delivered",
      callLabel,
      researchAttempted,
      searchesUsed,
      confidenceScore: matchResult.totalScore,
      destination: stack.brief_landing_destination ?? "slack",
    };
  } catch (callErr: any) {
    console.error(`[pre-call-read] Failed to brief ${callLabel}:`, callErr.message);
    await logStep(runId, {
      phase: "delivery",
      status: "failed",
      label: callLabel,
      detail: callErr.message,
    });
    return { status: "failed", callLabel, detail: callErr.message };
  }
}

/**
 * Fan-out worker: processes exactly ONE prospect. Invoked via
 * step.invoke() from executeNightlyBriefingCycle.
 *
 * concurrency here is function-scoped (not keyed to engagementId) and
 * deliberately caps the WHOLE app's concurrent brief pipelines at once.
 */
export const processSingleProspectBrief = inngest.createFunction(
  {
    id: "process-single-prospect-brief",
    triggers: [prospectBriefDispatch],
    concurrency: { limit: 15 },
  },
  async ({ event, step }) => {
    const { runId, engagementId, call: callData } = event.data;

    const tenantRaw = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      if (!row) throw new Error(`Engagement not found: ${engagementId}`);
      return row;
    });

    const tenant = {
      ...tenantRaw,
      createdAt: new Date(tenantRaw.createdAt),
      updatedAt: new Date(tenantRaw.updatedAt),
    };
    const stack = tenant.stack as any;
    const call = { ...callData, callTime: new Date(callData.callTime) };

    const run = <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn);
    return processSingleBriefCall(tenant, stack, runId, call, run);
  }
);

/**
 * Core briefing cycle execution runtime block.
 *
 * `triggerMode` — Pre-Call Read recovery gap 1. "nightly" (default) fetches
 * tomorrow's full roster. "dynamic_webhook" fetches window records.
 */
export async function executeNightlyBriefingCycle(
  tenant: any,
  runId: string,
  step?: StepTools,
  triggerMode: "nightly" | "dynamic_webhook" = "nightly"
): Promise<number> {
  let deliveredCount = 0;
  const summary = emptySummary();

  const run = step
    ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn)
    : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const stack = tenant.stack as any;

    const tomorrowCalls = await run("roster-fetch", async () => {
      await logStep(runId, { phase: "roster_fetch", status: "running" });

      if (!stack?.booking_platform || !stack?.booking_platform_credentials_ref) {
        throw new Error("Engagement missing booking_platform config. Run Pin-Down first.");
      }

      const bookingApiKey = await resolveCredential(
        tenant.engagementId,
        stack.booking_platform
      );

      const calls =
        triggerMode === "dynamic_webhook"
          ? await fetchUpcomingCallsForTenant(
              stack.booking_platform,
              bookingApiKey,
              stack.booking_platform_meta,
              0,
              Math.max(1, Math.min(48, stack.brief_lead_time_hours ?? 12))
            )
          : await fetchTomorrowCallsForTenant(stack.booking_platform, bookingApiKey, stack.booking_platform_meta);

      summary.whatWasAttempted.push(
        `Fetched ${triggerMode === "dynamic_webhook" ? "upcoming (dynamic window)" : "tomorrow's"} roster from ${stack.booking_platform}: ${calls.length} call(s) found.`
      );
      await logStep(runId, { phase: "roster_fetch", status: "success", detail: `${calls.length} call(s) found (${triggerMode})` });

      return calls;
    });

    const normalizedCalls = tomorrowCalls.map((c) => ({
      ...c,
      callTime: new Date(c.callTime),
    }));

    if (normalizedCalls.length === 0) {
      summary.whatWorked.push("No calls scheduled tomorrow — nothing to brief.");
    }

    // 🌟 THE FIX: Isolate parallel fanning from non-Inngest script invocations
    let outcomes: CallOutcome[] = [];

    if (step) {
      // Inngest worker channel: Safe parallel execution handled durably via external function fanning
      outcomes = await Promise.all(
        normalizedCalls.map((call) =>
          step.invoke(`brief-${call.id}`, {
            function: processSingleProspectBrief,
            data: {
              runId,
              engagementId: tenant.engagementId,
              call: {
                id: call.id,
                name: call.name,
                email: call.email,
                company: call.company,
                callTime: call.callTime.toISOString(),
                phone: call.phone,
                linkedInUrl: call.linkedInUrl,
              },
            },
          })
        )
      );
    } else {
      // Fallback channel: Enforce a strict sequential line-by-line evaluation path 
      // to guard our transaction pooler from immediate exhaustion
      for (const call of normalizedCalls) {
        const outcome = await processSingleBriefCall(tenant, stack, runId, call, run);
        outcomes.push(outcome);
      }
    }

    for (const outcome of outcomes) {
      if (outcome.status === "duplicate_skipped") {
        continue;
      }
      if (outcome.status === "delivered") {
        if (outcome.researchAttempted) {
          summary.whatWasAttempted.push(`Researched ${outcome.callLabel} via web search (${outcome.searchesUsed ?? 0} search(es)).`);
        }
        summary.whatWasAttempted.push(`Brief ${outcome.callLabel}.`);
        summary.whatWorked.push(`Delivered brief for ${outcome.callLabel} via ${outcome.destination} (confidence ${outcome.confidenceScore}/100).`);
        deliveredCount++;
      } else {
        summary.whatFailed.push(`Failed to brief ${outcome.callLabel}: ${outcome.detail}`);
      }
    }

    if (deliveredCount === 0 && normalizedCalls.length > 0) {
      summary.openItems.push("Every call on tomorrow's roster was already briefed in the last 24h — no new briefs sent.");
    }

    const hadFailures = summary.whatFailed.length > 0;
    if (hadFailures && deliveredCount === 0 && normalizedCalls.length > 0) {
      await failRun(runId, new Error(`All ${normalizedCalls.length} call(s) failed to brief — see summary for per-call errors.`), { summary });
      return deliveredCount;
    }

    if (hadFailures) {
      summary.openItems.push(`${summary.whatFailed.length} of ${normalizedCalls.length} call(s) failed to brief tonight — see What Failed above.`);
    }

    await finishRun(runId, { summary });
    return deliveredCount;
  } catch (err: any) {
    summary.whatFailed.push(err.message);
    await failRun(runId, err, { summary });
    throw err;
  }
}