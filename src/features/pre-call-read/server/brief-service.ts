import { db } from "@/lib/db";
import { briefedCallsLog } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { evaluatePersonMatch } from "../person-match";
import { researchProspect } from "./prospect-research";
import { runConfiguredEnrichment } from "./apollo-adapter";
import { resolveCredential } from "@/lib/credentials";
import { fetchTomorrowCallsForTenant, fetchUpcomingCallsForTenant } from "@/lib/platforms/booking";
import { deliverBrief, KlaviyoClient } from "@/lib/platforms/email";
import { getVideoEngagementForProspect } from "@/lib/platforms/video-engagement";
import { getAdDataContextForTenant } from "@/lib/platforms/ad-data";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
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
 * Core briefing cycle execution runtime block.
 *
 * `triggerMode` — Pre-Call Read recovery gap 1. "nightly" (default) fetches
 * tomorrow's full roster, same as always. "dynamic_webhook" instead fetches
 * whatever's newly inside the buyer's brief_lead_time_hours window — see
 * dynamicBriefCron in src/inngest/crons.ts, which calls this in that mode
 * on a tight rolling cadence instead of once nightly.
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

    // Roster fetch's running/success logStep pair now lives inside the
    // same step.run boundary as the fetch itself — same fix as
    // audit-engine.ts. Previously these two calls sat outside step.run,
    // so on a checkpoint-resumed replay both would fire again even though
    // fetchTomorrowCallsForTenant's own result would've been re-executed
    // too (it wasn't memoized either). Folding them together makes the
    // whole roster-fetch phase atomic: either the pair + the fetch all
    // happened once, or none of it did.
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
        // Clamped defensively between 1-48 hours to prevent lookahead array overflow or 0h empty results
        Math.max(1, Math.min(48, stack.brief_lead_time_hours ?? 12))
      )
    : await fetchTomorrowCallsForTenant(stack.booking_platform, bookingApiKey, stack.booking_platform_meta);

      summary.whatWasAttempted.push(
        `Fetched ${triggerMode === "dynamic_webhook" ? "upcoming (dynamic window)" : "tomorrow's"} roster from ${stack.booking_platform}: ${calls.length} call(s) found.`
      );
      await logStep(runId, { phase: "roster_fetch", status: "success", detail: `${calls.length} call(s) found (${triggerMode})` });

      return calls;
    });

    // Inngest serializes step.run() output as JSON by default (no custom
    // date-preserving middleware is registered on this client). On a
    // fresh execution `tomorrowCalls` above is already NormalizedCall[]
    // with real Date objects — but on any checkpoint-resumed replay, the
    // memoized result is deserialized from JSON and callTime comes back
    // as a plain ISO string, not a Date. Downstream code calls
    // `call.callTime.toISOString()` and inserts callTime into a Drizzle
    // column typed `Date`, both of which would throw at runtime on a
    // replayed step (this is exactly what TypeScript's own generated
    // types were flagging — not a false positive). `new Date(x)` is a
    // no-op for an existing Date and correctly parses the ISO string
    // case, so this line covers both paths.
    const normalizedCalls = tomorrowCalls.map((c) => ({
      ...c,
      callTime: new Date(c.callTime),
    }));

    if (normalizedCalls.length === 0) {
      summary.whatWorked.push("No calls scheduled tomorrow — nothing to brief.");
    }

    // Recovery gap — retry-with-memoization refactor. Each prospect used to
    // be processed inside ONE step.run() wrapping duplicate-check through
    // delivery. That solved the 504/checkpointing problem (a 50-prospect
    // roster isn't one monolithic request) but had a real cost: if
    // brief_synthesis failed transiently (an Anthropic rate limit, a
    // network blip) partway through that single step, the *entire*
    // step.run callback had to be retried from the top — including the
    // paid Apollo/PDL enrichment call inside prospect_research, which
    // would fire again and get billed again for a lookup already
    // successfully completed moments earlier.
    //
    // Below, each phase (dup-check, rule14-gate, research+enrichment,
    // engagement-context, synthesis, delivery) is its own named
    // step.run(), scoped per call.id so IDs stay unique across the whole
    // roster loop. Inngest memoizes each step's result independently: if
    // brief_synthesis throws, Inngest's automatic step-level retry (which
    // happens inline, before ever failing the whole function) re-runs
    // ONLY that step. research-${call.id} and context-${call.id} already
    // have memoized results by then and return instantly — Apollo, PDL,
    // Klaviyo, and the video/ad-data platforms are never called again for
    // this prospect within this run, no matter how many times synthesis
    // is retried. The per-call try/catch below still exists so one
    // prospect exhausting its retries can never take down the rest of the
    // roster — same batch-isolation guarantee as before, just no longer
    // at the cost of re-billing on every transient synthesis failure.
    for (const call of normalizedCalls) {
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
          continue;
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
        // Only runs for identities that already passed the gate above —
        // never researches an unconfirmed match. See prospect-research.ts
        // for why this uses Claude's own web search tool rather than a
        // LinkedIn scraper (LinkedIn's ToS prohibits scraping; there's no
        // legitimate API for arbitrary profile lookups). The free
        // web-search research and the paid Apollo/PDL enrichment are
        // bundled into a single step.run deliberately — they're
        // conceptually "the research phase," and bundling them means a
        // later retry can never re-trigger just one of the two paid/free
        // sources in isolation.
        let researchSummary: string | null = null;
        // Pre-Call Read recovery gap 6 — tracked explicitly for the
        // briefed_calls_log write below, cross-consumed by Win-Back
        // (was research done before this call was missed?) and Leak Map
        // (research completion rate across the roster).
        let researchStatus: "completed" | "skipped_low_confidence" | "failed" = "skipped_low_confidence";

        if (matchResult.passed) {
          await logStep(runId, { phase: "prospect_research", status: "running", label: callLabel });
          try {
            const researchResult = await run(`research-${call.id}`, async () => {
              const research = await researchProspect(call.name, call.email, call.company, runId);
              let combinedSummary = research.summary;

              // Pre-Call Read recovery gap 5 — BYOK Apollo/PDL enrichment,
              // additive to the free web-search research above.
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
            summary.whatWasAttempted.push(`Researched ${callLabel} via web search (${researchResult.searchesUsed} search(es)).`);
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
        // Also its own memoized step — Klaviyo/video/ad-data engagement
        // pulls are free-tier API calls, not billed per-lookup like
        // Apollo/PDL, but memoizing them too means a synthesis retry
        // doesn't needlessly re-hit three more external platforms.
        const engagementContext = await run(`context-${call.id}`, () =>
          gatherEngagementContext(tenant, stack, tenant.engagementId, call.email)
        );

        // ── Brief synthesis ─────────────────────────────────────────────
        // This is now the step most likely to actually get retried
        // in practice (transient Anthropic rate limits, brief network
        // blips) — and it's the ONLY step Inngest's automatic step-level
        // retry re-runs on such a hiccup. Every step above this point is
        // already memoized by the time this runs, so a retry here costs
        // nothing beyond the synthesis call itself.
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
        // Delivery and the briefed_calls_log insert stay bundled in one
        // step: if delivery succeeds but the DB insert somehow failed, we
        // don't want a retry to double-send the brief to Slack/email — a
        // memoized "already delivered" step prevents that regardless of
        // which half actually threw.
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
            // Reaching this step at all means synthesis (above) already
            // succeeded — synthesize-${call.id} throwing skips straight to
            // the outer catch below, same as the pre-refactor behavior
            // where a synthesis failure never reached the log-write line.
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

        summary.whatWasAttempted.push(`Brief ${callLabel} for call at ${call.callTime.toISOString()}.`);
        summary.whatWorked.push(`Delivered brief for ${callLabel} via ${stack.brief_landing_destination ?? "slack"} (confidence ${matchResult.totalScore}/100).`);

        deliveredCount++;
      } catch (callErr: any) {
        console.error(`[pre-call-read] Failed to brief ${callLabel}:`, callErr.message);
        await logStep(runId, {
          phase: "delivery",
          status: "failed",
          label: callLabel,
          detail: callErr.message,
        });
        summary.whatFailed.push(`Failed to brief ${callLabel}: ${callErr.message}`);
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