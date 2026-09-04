import { db } from "@/lib/db";
import { repIdentityGraphs, repEngineFindings, repTrustpilotReviews, repRedditMentions, repIncidents, skillRuns } from "@/models/schema";
import { and, eq, gt, gte, desc } from "drizzle-orm";
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
import { detectAnomalies, anomalyCooldownMs, type AnomalyResult } from "@/features/reputation-manager/server/anomaly-detection";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type ContributingFinding = { source: "engine_panel" | "trustpilot" | "reddit" | "anomaly"; excerpt: string; flagReason: string | null };
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

/** What actually gets persisted in contributingFindings — looser than
 * ScoredFinding (whose five score fields are all required, since the LLM
 * scores every real finding it's given) because a synthetic "anomaly"
 * entry was never scored on reach/sentiment/permanence and shouldn't
 * fabricate numbers to fit that shape. */
type StoredFinding = ContributingFinding & {
  reach?: number;
  sentiment?: number;
  permanence?: number;
  compositeScore?: number;
  signalClass?: string | null;
};

function anomalyToFinding(anomaly: AnomalyResult): StoredFinding {
  return { source: "anomaly", excerpt: anomaly.description, flagReason: anomaly.anomalyClass, signalClass: anomaly.anomalyClass };
}

/**
 * Anomaly checks re-evaluate a rolling window every run rather than a
 * "since last check" delta, so a condition that's still true on the next
 * cron tick would otherwise redeclare the same incident every time (see
 * anomalyCooldownMs's own comment). Drops any detected anomaly whose
 * class already has an incident declared for this engagement within its
 * own cooldown window — same anomaly, already known and notified.
 */
async function suppressRecentlyDeclaredAnomalies(engagementId: string, anomalies: AnomalyResult[], now: Date): Promise<AnomalyResult[]> {
  if (anomalies.length === 0) return anomalies;

  const recentSignalClasses = await db
    .select({ signalClass: repIncidents.signalClass, declaredAt: repIncidents.declaredAt })
    .from(repIncidents)
    .where(and(eq(repIncidents.engagementId, engagementId), gte(repIncidents.declaredAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))));

  return anomalies.filter((anomaly) => {
    const cooldownStart = new Date(now.getTime() - anomalyCooldownMs(anomaly.anomalyClass));
    const alreadyDeclared = recentSignalClasses.some((row) => row.signalClass === anomaly.anomalyClass && row.declaredAt >= cooldownStart);
    return !alreadyDeclared;
  });
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

    // Anomaly detection runs independent of flagged findings — a spike can
    // fire on ordinary-looking mentions arriving too fast, with zero
    // individual records ever flagged. Checked before the "nothing
    // flagged" early-return below so a pure-volume/pure-pattern anomaly
    // isn't silently missed just because nothing was individually flagged.
    const now = new Date();
    const rawAnomalies = await (step ? step.run("detect-anomalies", () => detectAnomalies(engagementId, now)) : detectAnomalies(engagementId, now));
    const anomalies = await (step
      ? step.run("suppress-recent-anomalies", () => suppressRecentlyDeclaredAnomalies(engagementId, rawAnomalies, now))
      : suppressRecentlyDeclaredAnomalies(engagementId, rawAnomalies, now));

    const sinceRaw = await (step ? step.run("find-last-run", () => lastSuccessfulRunAt(engagementId)) : lastSuccessfulRunAt(engagementId));
    const since = sinceRaw ? new Date(sinceRaw) : null;

    const findings = await (step
      ? step.run("load-flagged-findings", () => loadFlaggedFindingsSince(engagementId, since))
      : loadFlaggedFindingsSince(engagementId, since));

    if (findings.length === 0 && anomalies.length === 0) {
      await logStep(runId, { phase: "crisis_response", status: "success", detail: "Nothing flagged and no anomalies detected since last check." });
      summary.whatWorked.push("Checked for new flagged findings and anomalies — none since last check.");
      await finishRun(runId, { summary });
      return;
    }

    let scoredFindings: ScoredFinding[] = [];
    let contentSummary: string | null = null;
    let contentForceTriggerClass: SignalClass | null = null;
    let maxCompositeScore = 0;

    if (findings.length > 0) {
      await logStep(runId, { phase: "crisis_response", status: "running", detail: `Assessing ${findings.length} flagged finding(s).` });
      const assessment = await (step
        ? step.run("score-findings", () => scoreFindings(graph.operatorName, findings, runId))
        : scoreFindings(graph.operatorName, findings, runId));
      scoredFindings = assessment.scored;
      contentSummary = assessment.summary;
      contentForceTriggerClass = assessment.forceTriggerClass;
      maxCompositeScore = assessment.severityScore;
    }

    const floor = resolveCrisisScoreFloor(graph.crisisThresholdOverride);
    // Force-trigger classes AND anomalies both declare an incident
    // regardless of score — the composite model may under-rate a record
    // whose real risk isn't reach/sentiment/permanence-shaped (e.g. a
    // legal notice with low reach is still regulatory_or_legal_action),
    // and a statistical spike has no per-item score to compare against a
    // threshold in the first place. Matches crisis-triggers.yml.template's
    // auto_activation block plus thresholds.yml.template's
    // anomaly_detection block.
    const contentForceTriggered = contentForceTriggerClass !== null;
    const anomalyForceTriggered = anomalies.length > 0;
    const forceTriggered = contentForceTriggered || anomalyForceTriggered;
    // An anomaly firing guarantees at least floor-level severity is
    // recorded (there's no per-item composite to fall back on); flagged
    // findings can still push the number higher if their own scores
    // exceed it.
    const severityScore = anomalyForceTriggered ? Math.max(maxCompositeScore, floor) : maxCompositeScore;

    if (!forceTriggered && severityScore < floor) {
      await logStep(runId, {
        phase: "crisis_response",
        status: "success",
        detail: `Severity ${severityScore}/100, below this engagement's threshold of ${floor}. No incident declared.`,
      });
      summary.whatWorked.push(`Assessed ${findings.length} flagged finding(s) — severity ${severityScore}/100, below threshold.`);
      await finishRun(runId, { summary });
      return;
    }

    const anomalyFindings = anomalies.map(anomalyToFinding);
    const allFindings: StoredFinding[] = [...scoredFindings, ...anomalyFindings];
    const declaredSignalClass: string | null = contentForceTriggerClass ?? anomalies[0]?.anomalyClass ?? null;
    const summaryText =
      contentSummary && anomalies.length > 0
        ? `${contentSummary} Additionally: ${anomalies.map((a) => a.description).join(" ")}`
        : contentSummary ?? anomalies.map((a) => a.description).join(" ");

    const [incident] = await db
      .insert(repIncidents)
      .values({
        engagementId,
        severityScore,
        summary: summaryText,
        contributingFindings: allFindings,
        signalClass: declaredSignalClass,
      })
      .returning({ id: repIncidents.id });

    const triggerReason = contentForceTriggered
      ? `Force-triggered: classified as ${contentForceTriggerClass} (declares regardless of score).`
      : anomalyForceTriggered
        ? `Force-triggered by anomaly detection: ${anomalies.map((a) => a.anomalyClass).join(", ")} (declares regardless of score).`
        : `Severity ${severityScore}/100 crossed this engagement's threshold of ${floor}.`;

    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      runId,
      type: "reputation_crisis_declared",
      severity: "critical",
      title: `Reputation crisis declared — ${graph.operatorName}`,
      body:
        `${summaryText}\n\n${triggerReason} Severity: ${severityScore}/100. ` +
        `Sole authority on record: ${graph.soleAuthorityName}. Nothing has been published — this is a notification only.`,
      slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
    });

    await logStep(runId, {
      phase: "crisis_response",
      status: "success",
      detail: `Incident declared (severity ${severityScore}/100${forceTriggered ? `, force-triggered: ${declaredSignalClass}` : ""}) and operator notified.`,
    });
    summary.whatWorked.push(`Declared an incident — severity ${severityScore}/100 — and notified the operator.`);
    summary.decisionsMade.push(
      `Incident ${incident.id} created from ${allFindings.length} contributing item(s)${forceTriggered ? ` (force-triggered: ${declaredSignalClass})` : ""}.`
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
