import { db } from "@/lib/db";
import { repIdentityGraphs, repEngineFindings, repTrustpilotReviews, repRedditMentions, repIncidents, skillRuns } from "@/models/schema";
import { and, eq, gt, desc } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { notifyUser } from "@/lib/notify";
import { resolveCrisisScoreFloor } from "@/features/reputation-manager/rep-thresholds";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type ContributingFinding = { source: "engine_panel" | "trustpilot" | "reddit"; excerpt: string; flagReason: string | null };

async function loadFlaggedFindingsSince(engagementId: string, since: Date | null): Promise<ContributingFinding[]> {
  const [engineFindings, trustpilotReviews, redditMentions] = await Promise.all([
    db
      .select({ promptText: repEngineFindings.promptText, responseText: repEngineFindings.responseText, flagReason: repEngineFindings.flagReason })
      .from(repEngineFindings)
      .where(
        since
          ? and(eq(repEngineFindings.engagementId, engagementId), eq(repEngineFindings.flagged, true), gt(repEngineFindings.runAt, since))
          : and(eq(repEngineFindings.engagementId, engagementId), eq(repEngineFindings.flagged, true))
      ),
    db
      .select({ reviewText: repTrustpilotReviews.reviewText, rating: repTrustpilotReviews.rating, flagReason: repTrustpilotReviews.flagReason })
      .from(repTrustpilotReviews)
      .where(
        since
          ? and(eq(repTrustpilotReviews.engagementId, engagementId), eq(repTrustpilotReviews.flagged, true), gt(repTrustpilotReviews.createdAt, since))
          : and(eq(repTrustpilotReviews.engagementId, engagementId), eq(repTrustpilotReviews.flagged, true))
      ),
    db
      .select({ mentionText: repRedditMentions.mentionText, permalink: repRedditMentions.permalink, flagReason: repRedditMentions.flagReason })
      .from(repRedditMentions)
      .where(
        since
          ? and(eq(repRedditMentions.engagementId, engagementId), eq(repRedditMentions.flagged, true), gt(repRedditMentions.createdAt, since))
          : and(eq(repRedditMentions.engagementId, engagementId), eq(repRedditMentions.flagged, true))
      ),
  ]);

  return [
    ...engineFindings.map((f) => ({ source: "engine_panel" as const, excerpt: `Q: ${f.promptText}\nA: ${f.responseText}`, flagReason: f.flagReason })),
    ...trustpilotReviews.map((r) => ({ source: "trustpilot" as const, excerpt: `${r.rating}/5: ${r.reviewText}`, flagReason: r.flagReason })),
    ...redditMentions.map((m) => ({ source: "reddit" as const, excerpt: m.mentionText, flagReason: m.flagReason })),
  ];
}

async function lastSuccessfulRunAt(engagementId: string): Promise<Date | null> {
  const [row] = await db
    .select({ completedAt: skillRuns.completedAt })
    .from(skillRuns)
    .where(and(eq(skillRuns.engagementId, engagementId), eq(skillRuns.skillName, "rep-crisis-response"), eq(skillRuns.status, "success")))
    .orderBy(desc(skillRuns.completedAt))
    .limit(1);
  return row?.completedAt ?? null;
}

type SeverityAssessment = { severityScore: number; summary: string };

async function assessSeverity(operatorName: string, findings: ContributingFinding[], runId: string): Promise<SeverityAssessment> {
  const numbered = findings
    .map((f, i) => `[${i}] Source: ${f.source}\n${f.excerpt}${f.flagReason ? `\nWhy flagged: ${f.flagReason}` : ""}`)
    .join("\n\n");

  const result = await callClaude({
    model: "FAST",
    runId,
    maxTokens: 800,
    system:
      `You assess reputation-crisis severity for a business ("${operatorName}") given everything flagged across its ` +
      "AI-engine, Trustpilot, and Reddit monitoring since the last check. Score the CUMULATIVE situation 0-100 — " +
      "not any single item in isolation. Consider: is this one isolated complaint, or a real pattern across " +
      "sources? Does it involve a serious accusation (fraud, safety, legality)? Is it something a prospect would " +
      "actually see and be swayed by? A single mildly negative review is low (10-30). A coordinated pattern of " +
      "serious accusations across multiple sources is high (80+). Respond with ONLY JSON, no preamble, no " +
      'markdown fences:\n{"severityScore": 0-100, "summary": "2-3 sentences on what is actually happening and why it scored this way"}',
    userMessage: numbered,
  });

  try {
    const parsed = JSON.parse(result.text.trim().replace(/^```json\s*|\s*```$/g, ""));
    const score = Number(parsed.severityScore);
    if (!Number.isFinite(score) || score < 0 || score > 100 || typeof parsed.summary !== "string") {
      throw new Error("Malformed severity assessment response");
    }
    return { severityScore: Math.round(score), summary: parsed.summary };
  } catch (err) {
    throw new Error(`Could not parse severity assessment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runRepCrisisResponse(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step
      ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId))
      : loadIdentityGraph(engagementId));

    if (!graph) {
      await logStep(runId, { phase: "crisis_response", status: "skipped", detail: "No identity graph yet." });
      summary.openItems.push("Nothing to assess until the identity graph exists.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const sinceRaw = await (step ? step.run("find-last-run", () => lastSuccessfulRunAt(engagementId)) : lastSuccessfulRunAt(engagementId));
    const since = sinceRaw ? new Date(sinceRaw) : null;

    const findings = await (step
      ? step.run("load-flagged-findings", () => loadFlaggedFindingsSince(engagementId, since))
      : loadFlaggedFindingsSince(engagementId, since));

    if (findings.length === 0) {
      await logStep(runId, { phase: "crisis_response", status: "success", detail: "Nothing flagged since last check." });
      summary.whatWorked.push("Checked for new flagged findings — none since last check.");
      await finishRun(runId, { summary });
      return;
    }

    await logStep(runId, { phase: "crisis_response", status: "running", detail: `Assessing ${findings.length} flagged finding(s).` });

    const assessment = await (step
      ? step.run("assess-severity", () => assessSeverity(graph.operatorName, findings, runId))
      : assessSeverity(graph.operatorName, findings, runId));

    const floor = resolveCrisisScoreFloor(graph.crisisThresholdOverride);

    if (assessment.severityScore < floor) {
      await logStep(runId, {
        phase: "crisis_response",
        status: "success",
        detail: `Severity ${assessment.severityScore}/100, below this engagement's threshold of ${floor}. No incident declared.`,
      });
      summary.whatWorked.push(`Assessed ${findings.length} flagged finding(s) — severity ${assessment.severityScore}/100, below threshold.`);
      await finishRun(runId, { summary });
      return;
    }

    const [incident] = await db
      .insert(repIncidents)
      .values({
        engagementId,
        severityScore: assessment.severityScore,
        summary: assessment.summary,
        contributingFindings: findings,
      })
      .returning({ id: repIncidents.id });

    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      runId,
      type: "reputation_crisis_declared",
      severity: "critical",
      title: `Reputation crisis declared — ${graph.operatorName}`,
      body:
        `${assessment.summary}\n\nSeverity: ${assessment.severityScore}/100 (threshold: ${floor}). ` +
        `Sole authority on record: ${graph.soleAuthorityName}. Nothing has been published — this is a notification only.`,
      slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
    });

    await logStep(runId, {
      phase: "crisis_response",
      status: "success",
      detail: `Incident declared (severity ${assessment.severityScore}/100) and operator notified.`,
    });
    summary.whatWorked.push(`Declared an incident — severity ${assessment.severityScore}/100 — and notified the operator.`);
    summary.decisionsMade.push(`Incident ${incident.id} created from ${findings.length} contributing finding(s).`);

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

async function loadIdentityGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}
