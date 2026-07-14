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

    // Each prospect is processed inside its own step.run(). This is the
    // checkpoint boundary that actually solves the 504 problem: Inngest's
    // checkpointing (see src/lib/inngest.ts) executes these immediately
    // for low latency, but once maxRuntime is hit it yields back and
    // schedules a fresh HTTP call to /api/inngest to continue with the
    // next un-memoized call — so a 50-prospect roster is no longer one
    // monolithic multi-minute request. It also means a call that's
    // already been fully processed (brief sent + briefedCallsLog written)
    // is memoized and will NEVER be re-run, even on a function-level retry
    // — stronger idempotency than the DB dedup check alone provided.
    //
    // All logStep() calls for a given prospect (duplicate_check,
    // rule_14_gate, brief_synthesis, delivery) live inside `runCall`
    // below, which is itself the function passed to step.run() — so they
    // share the same memoization boundary as the work they describe. A
    // retry either replays a call's entire step.run (all its logStep
    // calls re-fire together with the actual work) or hits the memoized
    // result and re-runs none of it. No naked logStep calls remain
    // outside a step boundary in this file.
    for (const call of normalizedCalls) {
      const callLabel = `${call.name} (${call.email})`;
      const runCall = async () => {
        try {
          // ── Idempotency gate ────────────────────────────────────────────
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

          if (existing.length > 0) {
            await logStep(runId, { phase: "duplicate_check", status: "skipped", label: callLabel, detail: "Already briefed in the last 24h — skipped" });
            return;
          }

          // ── Rule 14 identity gate ───────────────────────────────────────
          await logStep(runId, { phase: "rule_14_gate", status: "running", label: callLabel });

          const matchResult = await evaluatePersonMatch(
            { email: call.email, name: call.name, companySupplied: call.company, linkedInUrlFromApp: call.linkedInUrl },
            stack.person_match_confidence_threshold ?? 99
          );

          await logStep(runId, {
            phase: "rule_14_gate",
            status: matchResult.passed ? "success" : "skipped",
            label: callLabel,
            detail: `Identity confidence ${matchResult.totalScore}/100${matchResult.passed ? "" : " — research omitted"}`,
          });

          // ── Prospect research ────────────────────────────────────────────
          // Only runs for identities that already passed the gate above —
          // never researches an unconfirmed match. See prospect-research.ts
          // for why this uses Claude's own web search tool rather than a
          // LinkedIn scraper (LinkedIn's ToS prohibits scraping; there's no
          // legitimate API for arbitrary profile lookups).
          let researchSummary: string | null = null;
          // Pre-Call Read recovery gap 6 — tracked explicitly for the
          // briefed_calls_log write below, cross-consumed by Win-Back
          // (was research done before this call was missed?) and Leak Map
          // (research completion rate across the roster).
          let researchStatus: "completed" | "skipped_low_confidence" | "failed" = "skipped_low_confidence";
          let aiSynthesisStatus: "completed" | "failed" = "failed";

          if (matchResult.passed) {
            await logStep(runId, { phase: "prospect_research", status: "running", label: callLabel });
            try {
              const research = await researchProspect(call.name, call.email, call.company, runId);
              researchSummary = research.summary;

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
                  researchSummary = [researchSummary, ...enrichments.map((e) => `[${e.source}] ${e.summary}`)]
                    .filter(Boolean)
                    .join("\n");
                }
              }

              researchStatus = "completed";
              summary.whatWasAttempted.push(`Researched ${callLabel} via web search (${research.searchesUsed} search(es)).`);
              await logStep(runId, {
                phase: "prospect_research",
                status: research.citedUrls.length > 0 ? "success" : "skipped",
                label: callLabel,
                detail:
                  research.citedUrls.length > 0
                    ? `${research.citedUrls.length} source(s) found`
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
          const engagementContext = await gatherEngagementContext(tenant, stack, tenant.engagementId, call.email);

          // ── Brief synthesis ─────────────────────────────────────────────
          await logStep(runId, { phase: "brief_synthesis", status: "running", label: callLabel });

          const userMessage = `Compile brief for prospect:
Name: ${call.name}
Email: ${call.email}
Company: ${call.company}
Call time: ${call.callTime.toISOString()}
Identity confidence score: ${matchResult.totalScore}/100
Research omitted: ${!matchResult.passed}`;

          let llmResult;
          try {
            llmResult = await callClaudeWithRetry({
              model: MODEL.SYNTHESIS,
              system: buildBriefSystemPrompt(tenant, researchSummary, engagementContext),
              userMessage,
              maxTokens: 1500,
              runId,
            });
            aiSynthesisStatus = "completed";
          } catch (synthesisErr: any) {
            aiSynthesisStatus = "failed";
            throw synthesisErr; // still a hard failure for this call — caught by the outer catch below
          }

          await logStep(runId, { phase: "brief_synthesis", status: "success", label: callLabel, detail: "7-section brief generated" });

          // ── Delivery ─────────────────────────────────────────────────────
          await logStep(runId, { phase: "delivery", status: "running", label: callLabel });

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

          // ── Log ─────────────────────────────────────────────────────────
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
            aiSynthesisStatus,
            createdAt: new Date(),
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
      };

      // step is only present when invoked from the Inngest worker
      // (src/inngest/skill.ts). The stale cron routes that still call this
      // function directly (no Inngest context) fall back to running inline
      // — no checkpointing, but at least it compiles and behaves like the
      // pre-refactor synchronous version instead of crashing on a missing
      // step argument.
      if (step) {
        await step.run(`brief-${call.id}`, runCall);
      } else {
        await runCall();
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