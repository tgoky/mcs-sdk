import { db } from "@/lib/db";
import { briefedCallsLog } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { evaluatePersonMatch } from "../person-match";
import { resolveCredential } from "@/lib/credentials";
import { fetchTomorrowCallsForTenant } from "@/lib/platforms/booking";
import { deliverBrief } from "@/lib/platforms/email";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import crypto from "crypto";

/**
 * Builds the 7-block brief system prompt.
 */
function buildBriefSystemPrompt(tenant: any): string {
  return `You are the Pre-Call Read briefing engine for Showtime.
Synthesize a concise closer brief in exactly 7 sections. Format each section title in bold (no # headers).
Sections required:
**Prospect Overview** | **Company Context** | **Engagement History** | **Likely Objections** | **Recommended Opening** | **Red Flags** | **Conversation Notes**

Brand voice constraints: ${JSON.stringify(tenant.brandVoiceProfile ?? {})}
Known objections to address: ${JSON.stringify(tenant.topObjections ?? [])}
Known call questions: ${JSON.stringify(tenant.topCallQuestions ?? [])}

If research was omitted due to low identity confidence, write "Research omitted — identity confidence below threshold" under Prospect Overview and leave Engagement History blank. Do not fabricate details.`;
}

/**
 * Core briefing cycle execution runtime block.
 */
export async function executeNightlyBriefingCycle(tenant: any, runId: string): Promise<number> {
  let deliveredCount = 0;
  const summary = emptySummary();

  // Push the initial status directly into the seeded trace row
  await logStep(runId, { phase: "roster_fetch", status: "running" });

  try {
    const stack = tenant.stack as any;
    if (!stack?.booking_platform || !stack?.booking_platform_credentials_ref) {
      throw new Error("Engagement missing booking_platform config. Run Pin-Down first.");
    }

    const bookingApiKey = await resolveCredential(
      tenant.engagementId,
      stack.booking_platform
    );

    const tomorrowCalls = await fetchTomorrowCallsForTenant(
      stack.booking_platform,
      bookingApiKey,
      stack.booking_platform_meta
    );

    summary.whatWasAttempted.push(`Fetched tomorrow's roster from ${stack.booking_platform}: ${tomorrowCalls.length} call(s) found.`);
    await logStep(runId, { phase: "roster_fetch", status: "success", detail: `${tomorrowCalls.length} call(s) on tomorrow's roster` });

    if (tomorrowCalls.length === 0) {
      summary.whatWorked.push("No calls scheduled tomorrow — nothing to brief.");
    }

    for (const call of tomorrowCalls) {
      const callLabel = `${call.name} (${call.email})`;

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
          continue;
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
          system: buildBriefSystemPrompt(tenant),
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
    }

    if (deliveredCount === 0 && tomorrowCalls.length > 0) {
      summary.openItems.push("Every call on tomorrow's roster was already briefed in the last 24h — no new briefs sent.");
    }

    const hadFailures = summary.whatFailed.length > 0;
    if (hadFailures && deliveredCount === 0 && tomorrowCalls.length > 0) {
      await failRun(runId, new Error(`All ${tomorrowCalls.length} call(s) failed to brief — see summary for per-call errors.`), { summary });
      return deliveredCount;
    }

    if (hadFailures) {
      summary.openItems.push(`${summary.whatFailed.length} of ${tomorrowCalls.length} call(s) failed to brief tonight — see What Failed above.`);
    }

    await finishRun(runId, { summary });
    return deliveredCount;
  } catch (err: any) {
    summary.whatFailed.push(err.message);
    await failRun(runId, err, { summary });
    throw err;
  }
}