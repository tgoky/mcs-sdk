import { db } from "@/lib/db";
import { briefedCallsLog } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { evaluatePersonMatch } from "../person-match";
import { researchProspect } from "./prospect-research";
import { resolveCredential } from "@/lib/credentials";
import { fetchTomorrowCallsForTenant } from "@/lib/platforms/booking";
import { deliverBrief } from "@/lib/platforms/email";
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
 */
function buildBriefSystemPrompt(tenant: any, researchSummary: string | null): string {
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
}`;
}

/**
 * Core briefing cycle execution runtime block.
 */
export async function executeNightlyBriefingCycle(
  tenant: any,
  runId: string,
  step?: StepTools
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

      const calls = await fetchTomorrowCallsForTenant(
        stack.booking_platform,
        bookingApiKey,
        stack.booking_platform_meta
      );

      summary.whatWasAttempted.push(`Fetched tomorrow's roster from ${stack.booking_platform}: ${calls.length} call(s) found.`);
      await logStep(runId, { phase: "roster_fetch", status: "success", detail: `${calls.length} call(s) on tomorrow's roster` });

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
            { email: call.email, name: call.name, companySupplied: call.company },
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
          if (matchResult.passed) {
            await logStep(runId, { phase: "prospect_research", status: "running", label: callLabel });
            const research = await researchProspect(call.name, call.email, call.company, runId);
            researchSummary = research.summary;
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
          } else {
            await logStep(runId, { phase: "prospect_research", status: "skipped", label: callLabel, detail: "Identity confidence below threshold" });
          }

          // ── Brief synthesis ─────────────────────────────────────────────
          await logStep(runId, { phase: "brief_synthesis", status: "running", label: callLabel });

          const userMessage = `Compile brief for prospect:
Name: ${call.name}
Email: ${call.email}
Company: ${call.company}
Call time: ${call.callTime.toISOString()}
Identity confidence score: ${matchResult.totalScore}/100
Research omitted: ${!matchResult.passed}`;

          const llmResult = await callClaudeWithRetry({
            model: MODEL.SYNTHESIS,
            system: buildBriefSystemPrompt(tenant, researchSummary),
            userMessage,
            maxTokens: 1500,
            runId,
          });

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