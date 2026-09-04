import { db } from "@/lib/db";
import { repIdentityGraphs, repEngineFindings, repTrustpilotReviews, repRedditMentions, repIncidents, skillRuns } from "@/models/schema";
import { and, eq, gt, desc } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { notifyUser } from "@/lib/notify";
import {
  resolveCrisisScoreFloor,
  SEVERITY_COMPOSITION_WEIGHTS,
  SEVERITY_AXIS_RUBRIC,
  SIGNAL_CLASSES_FORCE_TRIGGER,
  isForceTriggerSignalClass,
  type SignalClass,
} from "@/features/reputation-manager/rep-thresholds";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type ContributingFinding = { source: "engine_panel" | "trustpilot" | "reddit"; excerpt: string; flagReason: string | null };
type ScoredFinding = ContributingFinding & {
  reach: number;
  sentiment: number;
  permanence: number;
  compositeScore: number;
  signalClass: SignalClass | null;
};

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

type SeverityAssessment = { scored: ScoredFinding[]; severityScore: number; forceTriggerClass: SignalClass | null; summary: string };

function clampAxisScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/**
 * Replaces the old single "the LLM says 73" holistic guess with the
 * spec's actual model (thresholds.yml.template's severity_scoring +
 * crisis-triggers.yml.template's auto_activation.signal_classes_force_trigger):
 * one LLM call scores EACH finding on reach/sentiment/permanence (1-10,
 * grounded in the same rubric anchors the spec ships) and classifies it
 * into a force-trigger signal class or null — but the composite score
 * itself is computed here in code from the fixed 40/35/25 weights, not
 * guessed by the model. Deterministic and auditable: given the same
 * three axis scores, the composite is always the same number, and
 * that number is stored per-finding in contributingFindings for anyone
 * to re-check later.
 *
 * The LLM still sees every finding together in one call specifically so
 * it CAN classify coordinated_review_bomb (3+ negative items, same
 * surface, short window) — cross-finding pattern awareness lives in the
 * classification step now, not in a fuzzy "does this feel like a
 * pattern" holistic score.
 */
async function scoreFindings(operatorName: string, findings: ContributingFinding[], runId: string): Promise<SeverityAssessment> {
  const numbered = findings
    .map((f, i) => `[${i}] Source: ${f.source}\n${f.excerpt}${f.flagReason ? `\nWhy flagged: ${f.flagReason}` : ""}`)
    .join("\n\n");

  const result = await callClaude({
    model: "FAST",
    runId,
    maxTokens: 1200,
    system:
      `You score reputation-risk findings for a business ("${operatorName}"), flagged across its AI-engine, ` +
      "Trustpilot, and Reddit monitoring since the last check. For EACH numbered finding, score three axes 1-10:\n\n" +
      `- reach: ${SEVERITY_AXIS_RUBRIC.reach}\n` +
      `- sentiment: ${SEVERITY_AXIS_RUBRIC.sentiment}\n` +
      `- permanence: ${SEVERITY_AXIS_RUBRIC.permanence}\n\n` +
      "Also classify each finding's signalClass — one of " +
      `${SIGNAL_CLASSES_FORCE_TRIGGER.join(", ")}, or null if none apply. Classify coordinated_review_bomb only ` +
      "when you see 3 or more negative findings on the same surface (e.g. Trustpilot) clustered in a short window " +
      "across the finding set you're given now — not from a single item in isolation.\n\n" +
      "Finally, write ONE 2-3 sentence summary of what's actually happening across every finding together. " +
      'Respond with ONLY JSON, no preamble, no markdown fences:\n' +
      '{"findings": [{"index": 0, "reach": 1-10, "sentiment": 1-10, "permanence": 1-10, "signalClass": "..."|null}], "summary": "..."}',
    userMessage: numbered,
  });

  try {
    const parsed = JSON.parse(result.text.trim().replace(/^```json\s*|\s*```$/g, ""));
    if (!Array.isArray(parsed.findings) || typeof parsed.summary !== "string") {
      throw new Error("Malformed severity assessment response");
    }

    const byIndex = new Map<number, { reach: number; sentiment: number; permanence: number; signalClass: SignalClass | null }>(
      parsed.findings.map((f: any) => [
        Number(f.index),
        {
          reach: clampAxisScore(f.reach),
          sentiment: clampAxisScore(f.sentiment),
          permanence: clampAxisScore(f.permanence),
          signalClass: isForceTriggerSignalClass(f.signalClass) ? f.signalClass : null,
        },
      ])
    );

    const scored: ScoredFinding[] = findings.map((finding, i) => {
      const axes = byIndex.get(i) ?? { reach: 3, sentiment: 5, permanence: 3, signalClass: null };
      const compositeScore = Math.round(
        (axes.reach * SEVERITY_COMPOSITION_WEIGHTS.reach +
          axes.sentiment * SEVERITY_COMPOSITION_WEIGHTS.sentiment +
          axes.permanence * SEVERITY_COMPOSITION_WEIGHTS.permanence) *
          10
      );
      return { ...finding, ...axes, compositeScore: Math.min(100, Math.max(0, compositeScore)) };
    });

    const severityScore = Math.max(...scored.map((f) => f.compositeScore));
    const forceTriggerClass = scored.find((f) => f.signalClass !== null)?.signalClass ?? null;

    return { scored, severityScore, forceTriggerClass, summary: parsed.summary };
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
      ? step.run("score-findings", () => scoreFindings(graph.operatorName, findings, runId))
      : scoreFindings(graph.operatorName, findings, runId));

    const floor = resolveCrisisScoreFloor(graph.crisisThresholdOverride);
    // Force-trigger classes declare an incident regardless of score — the
    // composite model may under-rate a record whose real risk isn't
    // reach/sentiment/permanence-shaped (e.g. a legal notice with low
    // reach is still regulatory_or_legal_action). Matches crisis-
    // triggers.yml.template's auto_activation block exactly.
    const forceTriggered = assessment.forceTriggerClass !== null;

    if (!forceTriggered && assessment.severityScore < floor) {
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
        contributingFindings: assessment.scored,
        signalClass: assessment.forceTriggerClass,
      })
      .returning({ id: repIncidents.id });

    const triggerReason = forceTriggered
      ? `Force-triggered: classified as ${assessment.forceTriggerClass} (declares regardless of score).`
      : `Severity ${assessment.severityScore}/100 crossed this engagement's threshold of ${floor}.`;

    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      runId,
      type: "reputation_crisis_declared",
      severity: "critical",
      title: `Reputation crisis declared — ${graph.operatorName}`,
      body:
        `${assessment.summary}\n\n${triggerReason} Severity: ${assessment.severityScore}/100. ` +
        `Sole authority on record: ${graph.soleAuthorityName}. Nothing has been published — this is a notification only.`,
      slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
    });

    await logStep(runId, {
      phase: "crisis_response",
      status: "success",
      detail: `Incident declared (severity ${assessment.severityScore}/100${forceTriggered ? `, force-triggered: ${assessment.forceTriggerClass}` : ""}) and operator notified.`,
    });
    summary.whatWorked.push(`Declared an incident — severity ${assessment.severityScore}/100 — and notified the operator.`);
    summary.decisionsMade.push(
      `Incident ${incident.id} created from ${findings.length} contributing finding(s)${forceTriggered ? ` (force-triggered: ${assessment.forceTriggerClass})` : ""}.`
    );

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
