import { db } from "@/lib/db";
import { repIdentityGraphs, repEngineFindings, repTrustpilotReviews, repRedditMentions, repTwitterMentions, repWebFindings, repIncidents, skillRuns } from "@/models/schema";
import { and, eq, gt, gte, lte, desc, sql } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { notifyUser } from "@/lib/notify";
import { proposeCrisisPause } from "@/features/cold-open/server/crisis-pause";
import {
  resolveCrisisScoreFloor,
  SEVERITY_COMPOSITION_WEIGHTS,
  SEVERITY_AXIS_RUBRIC,
  SIGNAL_CLASSES_FORCE_TRIGGER,
  isForceTriggerSignalClass,
  REP_THRESHOLD_DEFAULTS,
  highestResponseTier,
  type SignalClass,
  type ResponseTier,
} from "@/features/reputation-manager/rep-thresholds";
import { detectAnomalies, anomalyCooldownMs, type AnomalyResult } from "@/features/reputation-manager/server/anomaly-detection";
import { loadRoutingContext, routeOneFinding } from "@/features/reputation-manager/server/response-routing";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export type ContributingFinding = { source: "engine_panel" | "trustpilot" | "reddit" | "twitter" | "google_reviews" | "news" | "search_results" | "anomaly"; excerpt: string; flagReason: string | null };
type ScoredFinding = ContributingFinding & {
  reach: number;
  sentiment: number;
  permanence: number;
  compositeScore: number;
  signalClass: SignalClass | null;
};

async function loadFlaggedFindingsSince(engagementId: string, since: Date | null, upTo: Date): Promise<ContributingFinding[]> {
  const [engineFindings, trustpilotReviews, redditMentions, twitterMentions, webFindings] = await Promise.all([
    db
      .select({ promptText: repEngineFindings.promptText, responseText: repEngineFindings.responseText, flagReason: repEngineFindings.flagReason })
      .from(repEngineFindings)
      .where(
        since
          ? and(eq(repEngineFindings.engagementId, engagementId), eq(repEngineFindings.flagged, true), gt(repEngineFindings.runAt, since), lte(repEngineFindings.runAt, upTo))
          : and(eq(repEngineFindings.engagementId, engagementId), eq(repEngineFindings.flagged, true), lte(repEngineFindings.runAt, upTo))
      ),
    db
      .select({ reviewText: repTrustpilotReviews.reviewText, rating: repTrustpilotReviews.rating, flagReason: repTrustpilotReviews.flagReason })
      .from(repTrustpilotReviews)
      .where(
        since
          ? and(eq(repTrustpilotReviews.engagementId, engagementId), eq(repTrustpilotReviews.flagged, true), gt(repTrustpilotReviews.createdAt, since), lte(repTrustpilotReviews.createdAt, upTo))
          : and(eq(repTrustpilotReviews.engagementId, engagementId), eq(repTrustpilotReviews.flagged, true), lte(repTrustpilotReviews.createdAt, upTo))
      ),
    db
      .select({ mentionText: repRedditMentions.mentionText, permalink: repRedditMentions.permalink, flagReason: repRedditMentions.flagReason })
      .from(repRedditMentions)
      .where(
        since
          ? and(eq(repRedditMentions.engagementId, engagementId), eq(repRedditMentions.flagged, true), gt(repRedditMentions.createdAt, since), lte(repRedditMentions.createdAt, upTo))
          : and(eq(repRedditMentions.engagementId, engagementId), eq(repRedditMentions.flagged, true), lte(repRedditMentions.createdAt, upTo))
      ),
    db
      .select({ mentionText: repTwitterMentions.mentionText, permalink: repTwitterMentions.permalink, flagReason: repTwitterMentions.flagReason })
      .from(repTwitterMentions)
      .where(
        since
          ? and(eq(repTwitterMentions.engagementId, engagementId), eq(repTwitterMentions.flagged, true), gt(repTwitterMentions.createdAt, since), lte(repTwitterMentions.createdAt, upTo))
          : and(eq(repTwitterMentions.engagementId, engagementId), eq(repTwitterMentions.flagged, true), lte(repTwitterMentions.createdAt, upTo))
      ),
    db
      .select({ source: repWebFindings.source, title: repWebFindings.title, text: repWebFindings.text, rating: repWebFindings.rating, flagReason: repWebFindings.flagReason })
      .from(repWebFindings)
      .where(
        since
          ? and(eq(repWebFindings.engagementId, engagementId), eq(repWebFindings.flagged, true), gt(repWebFindings.createdAt, since), lte(repWebFindings.createdAt, upTo))
          : and(eq(repWebFindings.engagementId, engagementId), eq(repWebFindings.flagged, true), lte(repWebFindings.createdAt, upTo))
      ),
  ]);

  return [
    ...engineFindings.map((f) => ({ source: "engine_panel" as const, excerpt: `Q: ${f.promptText}\nA: ${f.responseText}`, flagReason: f.flagReason })),
    ...trustpilotReviews.map((r) => ({ source: "trustpilot" as const, excerpt: `${r.rating}/5: ${r.reviewText}`, flagReason: r.flagReason })),
    ...redditMentions.map((m) => ({ source: "reddit" as const, excerpt: m.mentionText, flagReason: m.flagReason })),
    ...twitterMentions.map((m) => ({ source: "twitter" as const, excerpt: m.mentionText, flagReason: m.flagReason })),
    ...webFindings.map((w) => ({ source: w.source, excerpt: `${w.rating != null ? `${w.rating}/5: ` : ""}${w.text}`, flagReason: w.flagReason })),
  ];
}

async function databaseNow(): Promise<string> {
  const rows = await db.execute<{ now: string | Date }>(sql`select now() as now`);
  const value = (rows as unknown as { now: string | Date }[])[0]?.now;
  return new Date(value ?? Date.now()).toISOString();
}

async function crisisCheckedThroughFor(engagementId: string): Promise<string | null> {
  const [row] = await db.select({ at: repIdentityGraphs.crisisCheckedThrough }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row?.at ? new Date(row.at).toISOString() : null;
}

/** Moves the window forward and releases this run's claim. Only while
 * this run still holds the claim, and never backwards: a run that went
 * slow and lost its claim to a newer run mustn't undo that run's window. */
export async function markCheckedThrough(engagementId: string, upTo: Date, runId: string): Promise<void> {
  const upToParam = sql.param(upTo, repIdentityGraphs.crisisCheckedThrough);
  await db
    .update(repIdentityGraphs)
    .set({
      crisisCheckedThrough: sql`greatest(coalesce(${repIdentityGraphs.crisisCheckedThrough}, ${upToParam}), ${upToParam})`,
      crisisClaimRunId: null,
      crisisClaimedAt: null,
    })
    .where(and(eq(repIdentityGraphs.engagementId, engagementId), eq(repIdentityGraphs.crisisClaimRunId, runId)));
}

/** Confirms this run still holds the claim and restarts its clock, right
 * before an incident is declared. False when a newer run took it over
 * after this one went quiet for too long. */
export async function renewCrisisClaim(engagementId: string, runId: string): Promise<boolean> {
  const [row] = await db
    .update(repIdentityGraphs)
    .set({ crisisClaimedAt: new Date() })
    .where(and(eq(repIdentityGraphs.engagementId, engagementId), eq(repIdentityGraphs.crisisClaimRunId, runId)))
    .returning({ id: repIdentityGraphs.id });
  return Boolean(row);
}

/** A claim older than this is assumed to belong to a run that died. */
const CRISIS_CLAIM_STALE_MINUTES = 30;

/**
 * Takes this client's crisis window for this run, in one statement. Fails
 * while another run holds a fresh claim; this run's own retry may re-take
 * it. Without it, two overlapping runs read the same window and both
 * declared the incident: two incident rows, two operator pages.
 */
export async function claimCrisisWindow(engagementId: string, runId: string): Promise<boolean> {
  const [row] = await db
    .update(repIdentityGraphs)
    .set({ crisisClaimRunId: runId, crisisClaimedAt: new Date() })
    .where(
      and(
        eq(repIdentityGraphs.engagementId, engagementId),
        sql`(${repIdentityGraphs.crisisClaimedAt} is null
          or ${repIdentityGraphs.crisisClaimRunId} = ${runId}
          or ${repIdentityGraphs.crisisClaimedAt} < now() - make_interval(mins => ${CRISIS_CLAIM_STALE_MINUTES}))`
      )
    )
    .returning({ id: repIdentityGraphs.id });
  return Boolean(row);
}

/** Releases this run's claim without moving the window (a failed run). */
async function releaseCrisisWindow(engagementId: string, runId: string): Promise<void> {
  await db
    .update(repIdentityGraphs)
    .set({ crisisClaimRunId: null, crisisClaimedAt: null })
    .where(and(eq(repIdentityGraphs.engagementId, engagementId), eq(repIdentityGraphs.crisisClaimRunId, runId)));
}

/** Only used until a client's first run under the window above records
 * crisisCheckedThrough; older runs left nothing better to start from. */
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
export async function scoreFindings(operatorName: string, findings: ContributingFinding[], runId: string): Promise<SeverityAssessment> {
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
      "Also classify each finding's signalClass as one of " +
      `${SIGNAL_CLASSES_FORCE_TRIGGER.join(", ")}, or null if none apply. Classify coordinated_review_bomb only ` +
      "when you see 3 or more negative findings on the same surface (e.g. Trustpilot) clustered in a short window " +
      "across the finding set you're given now, not from a single item in isolation.\n\n" +
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

/**
 * Inserts the incident row and sends the crisis notification. Wrapped by
 * the caller in a single step.run — this used to be two un-stepped
 * operations run directly in the main function body, which meant an
 * Inngest retry triggered by ANY later failure (even something as benign
 * as a transient error writing the run's final summary) would re-execute
 * both: a second, duplicate incident row, and the operator paged twice
 * for the same crisis. notifyUser itself never throws (every channel —
 * in-app, Slack, email, chat — is isolated in its own try/catch, see
 * notify.ts's file header), so once this step completes it's safe to
 * treat as atomic; step.run's memoization is what actually prevents the
 * replay, not anything inside this function.
 */
async function declareIncident(params: {
  tenant: any;
  engagementId: string;
  runId: string;
  severityScore: number;
  summaryText: string;
  allFindings: StoredFinding[];
  declaredSignalClass: string | null;
  triggerReason: string;
  operatorName: string;
  soleAuthorityName: string;
  operatorPagePhone: string | null;
}): Promise<{ incidentId: string }> {
  const { tenant, engagementId, runId, severityScore, summaryText, allFindings, declaredSignalClass, triggerReason, operatorName, soleAuthorityName, operatorPagePhone } = params;

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

  await notifyUser({
    whopUserId: tenant.whopUserId,
    engagementId,
    runId,
    type: "reputation_crisis_declared",
    severity: "critical",
    title: `Reputation crisis declared: ${operatorName}`,
    body:
      `${summaryText}\n\n${triggerReason} Severity: ${severityScore}/100. ` +
      `Sole authority on record: ${soleAuthorityName}. Nothing has been published. This is a notification only.`,
    slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
    smsToPhone: operatorPagePhone ?? undefined,
  });

  return { incidentId: incident.id };
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

    const claimed = await (step ? step.run("claim-window", () => claimCrisisWindow(engagementId, runId)) : claimCrisisWindow(engagementId, runId));
    if (!claimed) {
      await logStep(runId, { phase: "crisis_response", status: "skipped", detail: "Another Crisis Response run is assessing this client right now." });
      summary.openItems.push("Skipped: another run was already assessing this client.");
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

    // The window this run covers: (since, upTo]. upTo comes from the
    // database clock, the same clock the findings' timestamps use.
    // Read after the claim, not from the graph loaded above: a run that
    // finished in between has moved the window on.
    const checkedThrough = await (step ? step.run("window-start", () => crisisCheckedThroughFor(engagementId)) : crisisCheckedThroughFor(engagementId));
    const sinceRaw = checkedThrough
      ? checkedThrough
      : await (step ? step.run("find-last-run", () => lastSuccessfulRunAt(engagementId)) : lastSuccessfulRunAt(engagementId));
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const upToRaw = await (step ? step.run("window-end", () => databaseNow()) : databaseNow());
    const upTo = new Date(upToRaw);
    const advanceWindow = () => (step ? step.run("advance-window", () => markCheckedThrough(engagementId, upTo, runId)) : markCheckedThrough(engagementId, upTo, runId));

    const findings = await (step
      ? step.run("load-flagged-findings", () => loadFlaggedFindingsSince(engagementId, since, upTo))
      : loadFlaggedFindingsSince(engagementId, since, upTo));

    if (findings.length === 0 && anomalies.length === 0) {
      await logStep(runId, { phase: "crisis_response", status: "success", detail: "Nothing flagged and no anomalies detected since last check." });
      summary.whatWorked.push("Checked for new flagged findings and anomalies. None since last check.");
      await advanceWindow();
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
      // Real-time-alert floor (thresholds.yml.template's real_time_alert_gate,
      // REP_THRESHOLD_DEFAULTS.realTimeAlertFloor) — not severe enough for a
      // declared incident, but severe enough that waiting for the next
      // digest.ts run would be a real gap. A lighter, non-incident heads-up:
      // no repIncidents row, no SMS (severity "warning" not "critical"), just
      // in-app/Slack/email so the operator sees it today instead of tomorrow.
      // Below this floor, nothing fires here — digest.ts's next run is where
      // it surfaces, exactly as the spec intends.
      if (severityScore >= REP_THRESHOLD_DEFAULTS.realTimeAlertFloor) {
        await notifyUser({
          whopUserId: tenant.whopUserId,
          engagementId,
          runId,
          type: "reputation_elevated_activity",
          severity: "warning",
          title: `Elevated activity: ${graph.operatorName}`,
          body:
            `${contentSummary ?? "Flagged findings"} scored ${severityScore}/100, below the ${floor} incident threshold, ` +
            "but above the real-time-alert floor, so this isn't waiting for the next digest.",
          slackWebhookUrl: (tenant.stack as { slack_webhook_url?: string } | null)?.slack_webhook_url,
        });
      }

      await logStep(runId, {
        phase: "crisis_response",
        status: "success",
        detail: `Severity ${severityScore}/100, below this engagement's threshold of ${floor}. No incident declared.`,
      });
      summary.whatWorked.push(`Assessed ${findings.length} flagged finding(s): severity ${severityScore}/100, below threshold.`);
      await advanceWindow();
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

    const triggerReason = contentForceTriggered
      ? `Force-triggered: classified as ${contentForceTriggerClass} (declares regardless of score).`
      : anomalyForceTriggered
        ? `Force-triggered by anomaly detection: ${anomalies.map((a) => a.anomalyClass).join(", ")} (declares regardless of score).`
        : `Severity ${severityScore}/100 crossed this engagement's threshold of ${floor}.`;

    // One step: insert the incident and notify — see declareIncident's
    // own comment for why both needed to move behind a single step.run
    // rather than running directly here.
    const declareParams = {
      tenant,
      engagementId,
      runId,
      severityScore,
      summaryText,
      allFindings,
      declaredSignalClass,
      triggerReason,
      operatorName: graph.operatorName,
      soleAuthorityName: graph.soleAuthorityName,
      operatorPagePhone: graph.operatorPagePhone,
    };
    // One step: insert the incident and notify — see declareIncident's
    // own comment for why both needed to move behind a single step.run
    // rather than running directly here.
    const stillOurs = await (step ? step.run("confirm-claim", () => renewCrisisClaim(engagementId, runId)) : renewCrisisClaim(engagementId, runId));
    if (!stillOurs) {
      await logStep(runId, { phase: "crisis_response", status: "skipped", detail: "A newer Crisis Response run took over this client's assessment." });
      summary.openItems.push("Skipped: a newer run took over before an incident was declared.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }
    const { incidentId } = await (step
      ? step.run("declare-incident", () => declareIncident(declareParams))
      : declareIncident(declareParams));

    // Cold email shouldn't keep going out under the client's name mid-crisis:
    // propose pausing Cold Open (approval first). Nothing when it isn't sending.
    const proposePause = () => proposeCrisisPause(engagementId, incidentId, summaryText).catch((e) => {
      console.error("[rep-crisis-response] cold open pause proposal failed:", e);
      return null;
    });
    await (step ? step.run("propose-cold-open-pause", proposePause) : proposePause());

    // Routes every contributing finding to its response tier (auto-draft,
    // pause-for-posture, or external escalation) — see response-routing.ts.
    // One step per finding, not one step for the whole batch: a retry
    // triggered by an LLM drafting hiccup on finding 3 of 5 must only
    // re-run finding 3, not re-queue duplicate drafts/pending-actions for
    // findings 1-2 that already succeeded — step.run's own memoization is
    // what buys that per-finding idempotency, which a single big step
    // wrapping a for-loop would not.
    const routingContext = await (step ? step.run("load-routing-context", () => loadRoutingContext(engagementId)) : loadRoutingContext(engagementId));

    const responseTiers: ResponseTier[] = [];
    if (routingContext) {
      const declaredAt = new Date();
      for (let i = 0; i < allFindings.length; i++) {
        const finding = allFindings[i];
        const tier = await (step
          ? step.run(`route-finding-${i}`, () =>
              routeOneFinding({
                tenant,
                engagementId,
                incidentId,
                runId,
                context: routingContext,
                finding,
                severityScore,
                declaredSignalClass,
                summary: summaryText,
                allFindings,
                declaredAt,
              })
            )
          : routeOneFinding({
              tenant,
              engagementId,
              incidentId,
              runId,
              context: routingContext,
              finding,
              severityScore,
              declaredSignalClass,
              summary: summaryText,
              allFindings,
              declaredAt,
            }));
        if (tier) responseTiers.push(tier);
      }
    }
    const responseTier = highestResponseTier(responseTiers);

    if (responseTier) {
      await (step
        ? step.run("persist-response-tier", () => db.update(repIncidents).set({ responseTier }).where(eq(repIncidents.id, incidentId)))
        : db.update(repIncidents).set({ responseTier }).where(eq(repIncidents.id, incidentId)));
    }

    await logStep(runId, {
      phase: "crisis_response",
      status: "success",
      detail: `Incident declared (severity ${severityScore}/100${forceTriggered ? `, force-triggered: ${declaredSignalClass}` : ""}) and operator notified.`,
    });
    summary.whatWorked.push(`Declared an incident (severity ${severityScore}/100) and notified the operator.`);
    summary.decisionsMade.push(
      `Incident ${incidentId} created from ${allFindings.length} contributing item(s)${forceTriggered ? ` (force-triggered: ${declaredSignalClass})` : ""}.`
    );

    await advanceWindow();
    await finishRun(runId, { summary });
  } catch (err) {
    await releaseCrisisWindow(engagementId, runId).catch(() => {});
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

async function loadIdentityGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}
