import { db } from "@/lib/db";
import { skillRuns, briefedCallsLog, engagements } from "@/models/schema";
import { and, eq, gte } from "drizzle-orm";
import { evaluatePersonMatch } from "./person-match";
import { resolveCredential } from "@/lib/credentials";
import { fetchTomorrowCallsForTenant } from "@/lib/platforms/booking";
import { deliverBrief } from "@/lib/platforms/email";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import crypto from "crypto";

/**
 * Builds the 7-block brief system prompt.
 * Sections: Prospect Overview, Company Context, Engagement History,
 * Likely Objections, Recommended Opening, Red Flags, Conversation Notes.
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
 * Nightly briefing cycle — called once per active engagement from the cron route.
 * Returns the count of briefs successfully delivered.
 */
export async function executeNightlyBriefingCycle(tenant: any): Promise<number> {
  const runId = crypto.randomUUID();
  let deliveredCount = 0;

  await db.insert(skillRuns).values({
    id: runId,
    engagementId: tenant.engagementId,
    skillName: "pre-call-read",
    phase: "roster_fetch",
    status: "running",
    startedAt: new Date(),
  });

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

    for (const call of tomorrowCalls) {
      // ── Idempotency gate ──────────────────────────────────────────────
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
        // Already briefed this call in the last 24h — skip
        continue;
      }

      // ── Rule 14 identity gate ─────────────────────────────────────────
      await db
        .update(skillRuns)
        .set({ phase: "rule_14_gate" })
        .where(eq(skillRuns.id, runId));

      const matchResult = await evaluatePersonMatch(
        { email: call.email, name: call.name, companySupplied: call.company },
        stack.person_match_confidence_threshold ?? 99
      );

      // ── Brief synthesis ───────────────────────────────────────────────
      await db
        .update(skillRuns)
        .set({ phase: "brief_synthesis" })
        .where(eq(skillRuns.id, runId));

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
        runId, // writes cost back to skillRuns
      });

      // ── Delivery ──────────────────────────────────────────────────────
      await db
        .update(skillRuns)
        .set({ phase: "delivery" })
        .where(eq(skillRuns.id, runId));

      // Resolve email platform key only if the platform is configured.
      // Provider key must match what was stored during Pin-Down setup.
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

      // ── Log ───────────────────────────────────────────────────────────
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

      deliveredCount++;
    }

    await db
      .update(skillRuns)
      .set({ status: "success", completedAt: new Date() })
      .where(eq(skillRuns.id, runId));

    return deliveredCount;
  } catch (err: any) {
    await db
      .update(skillRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(skillRuns.id, runId))
      .catch(() => {});
    throw err;
  }
}