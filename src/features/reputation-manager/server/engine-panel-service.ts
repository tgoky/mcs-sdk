import { db } from "@/lib/db";
import { repIdentityGraphs, repEngineFindings, type RepEngineId, type RepFindingSentiment } from "@/models/schema";
import { eq } from "drizzle-orm";
import { callOpenRouterModel, callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { REP_ENGINE_IDS, REP_ENGINE_LABELS, resolveEngineModel } from "@/features/reputation-manager/engine-models";
import { logAuditEventsBatch, type RepAuditEvent } from "@/features/reputation-manager/server/audit-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type RawFinding = { engineId: RepEngineId; promptText: string; responseText: string };
type ScoredFinding = RawFinding & { sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null };

const MAX_TOKENS_PER_ENGINE_RESPONSE = 600;

/**
 * Queries one prompt against one engine. Never throws past this
 * function — a single engine/prompt failure (rate limit, provider
 * outage, an engine nobody's configured a model for) is recorded and
 * skipped rather than taking down the whole run; the other engines'
 * checks are independent and shouldn't be held hostage by one that's
 * having a bad day.
 */
async function queryEngine(engineId: RepEngineId, operatorName: string, promptText: string, runId: string): Promise<RawFinding | { error: string; engineId: RepEngineId }> {
  const modelString = resolveEngineModel(engineId);
  if (!modelString) {
    return { error: `No model configured for ${REP_ENGINE_LABELS[engineId]} (${engineId}) — skipped.`, engineId };
  }
  try {
    const result = await callOpenRouterModel(modelString, {
      runId,
      maxTokens: MAX_TOKENS_PER_ENGINE_RESPONSE,
      system: "Answer naturally and directly, the way you would for any real user asking this question. Don't mention that you're being tested or monitored.",
      userMessage: promptText,
    });
    return { engineId, promptText, responseText: result.text };
  } catch (err) {
    return { error: `${REP_ENGINE_LABELS[engineId]}: ${err instanceof Error ? err.message : String(err)}`, engineId };
  }
}

type ScoringResult = { index: number; sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null }[];

/**
 * One batch call scoring every raw response from this run at once,
 * rather than a separate scoring call per response — the latter would
 * double the run's call count for a task that doesn't need per-response
 * isolation (the model can hold N short Q&A pairs in context at once
 * fine). Falls back to a neutral, unflagged score for every finding if
 * this call fails or returns something unparseable — losing the score
 * isn't losing the finding; the raw response is still written either
 * way (see runRepEnginePanel), and a missed score can be revisited later
 * where a missed raw response can't be reconstructed.
 */
async function scoreFindings(operatorName: string, findings: RawFinding[], runId: string): Promise<ScoredFinding[]> {
  if (findings.length === 0) return [];

  const neutralFallback = (): ScoredFinding[] =>
    findings.map((f) => ({ ...f, sentiment: "neutral" as const, flagged: false, flagReason: null }));

  try {
    const numbered = findings
      .map((f, i) => `[${i}] Engine: ${REP_ENGINE_LABELS[f.engineId]}\nQuestion: ${f.promptText}\nAnswer: ${f.responseText}`)
      .join("\n\n");

    const result = await callClaude({
      model: "FAST",
      runId,
      maxTokens: 1500,
      system:
        `You score AI-engine responses about a specific business ("${operatorName}") for reputation risk. For each ` +
        "numbered item, classify the ANSWER's sentiment toward the operator (positive, neutral, or negative), and " +
        "flag it (flagged: true) if it contains factual errors about the operator, confuses the operator with a " +
        "different person or company, makes a serious negative claim (scam, fraud, illegal, unsafe), or otherwise " +
        "needs a human to actually look at it. Most answers won't need flagging — only flag real issues, not just " +
        'mildly lukewarm phrasing. Respond with ONLY a JSON array, no preamble, no markdown fences:\n' +
        '[{"index": 0, "sentiment": "positive"|"neutral"|"negative", "flagged": boolean, "flagReason": "one sentence, or null if not flagged"}]',
      userMessage: numbered,
    });

    const jsonText = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed: ScoringResult = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error("Scoring response is not an array");

    const byIndex = new Map(parsed.map((p) => [p.index, p]));
    return findings.map((f, i) => {
      const score = byIndex.get(i);
      if (!score || !["positive", "neutral", "negative"].includes(score.sentiment)) {
        return { ...f, sentiment: "neutral" as const, flagged: false, flagReason: null };
      }
      return { ...f, sentiment: score.sentiment, flagged: Boolean(score.flagged), flagReason: score.flagReason ?? null };
    });
  } catch {
    return neutralFallback();
  }
}

/**
 * rep-engine-panel's execute() — runs the tripwire prompts already
 * captured at intake (repIdentityGraphs.seedPanelPrompts) against
 * whichever engines have a model configured (see engine-models.ts).
 * Scoped-down v1: no full 46-prompt panel, no locking ceremony — see
 * this skill's manifest entry for why.
 *
 * Dispatched the same way leak-map and win-back are: a cron finds
 * eligible engagements and calls dispatchSkillRun for each, which
 * creates a real skillRuns row and fires this through the standard
 * skill/run.execute path — full run history, cost tracking, same as
 * every other skill in this app, not a bespoke uninstrumented cron.
 */
export async function runRepEnginePanel(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId)) : loadIdentityGraph(engagementId));

    if (!graph || graph.seedPanelPrompts.length === 0) {
      await logStep(runId, {
        phase: "engine_panel",
        status: "skipped",
        detail: "No identity graph or no seed prompts to check yet.",
      });
      summary.whatWasAttempted.push("Checked for seed prompts to run.");
      summary.openItems.push("Nothing to check until the identity graph has at least one seed prompt.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const configuredEngines = REP_ENGINE_IDS.filter((id) => resolveEngineModel(id) !== null);
    // Narrow to this client's selection, if they've set one — a null
    // activeEngines (the default, and every row before this field
    // existed) means "all configured engines," identical to the
    // behavior before this filter existed. Only ever narrows; a client
    // can't select an engine that isn't platform-configured in the
    // first place.
    const activeEngines = graph.activeEngines
      ? configuredEngines.filter((id) => graph.activeEngines!.includes(id))
      : configuredEngines;
    if (activeEngines.length === 0) {
      const detail =
        configuredEngines.length === 0
          ? "No engines have a model configured."
          : "This client's selected engines don't overlap with any platform-configured engine.";
      await logStep(runId, { phase: "engine_panel", status: "skipped", detail });
      summary.openItems.push(
        configuredEngines.length === 0
          ? "Set at least one REP_ENGINE_MODEL_* env var to start checking anything."
          : "This client's active-engines selection doesn't match any configured engine — check their identity graph settings."
      );
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    await logStep(runId, {
      phase: "engine_panel",
      status: "running",
      detail: `Checking ${graph.seedPanelPrompts.length} prompt(s) against ${activeEngines.length} engine(s).`,
    });

    const queries: Promise<RawFinding | { error: string; engineId: RepEngineId }>[] = [];
    for (const promptText of graph.seedPanelPrompts) {
      for (const engineId of activeEngines) {
        queries.push(queryEngine(engineId, graph.operatorName, promptText, runId));
      }
    }

    const results = await (step ? step.run("query-engines", () => Promise.all(queries)) : Promise.all(queries));
    const rawFindings = results.filter((r): r is RawFinding => !("error" in r));
    const errors = results.filter((r): r is { error: string; engineId: RepEngineId } => "error" in r);

    for (const err of errors) {
      await logStep(runId, { phase: "engine_panel", status: "failed", detail: err.error });
    }

    if (rawFindings.length === 0) {
      summary.whatFailed.push("Every engine query failed or was unconfigured — nothing to score or record.");
      await finishRun(runId, { summary });
      return;
    }

    const scored = await (step
      ? step.run("score-findings", () => scoreFindings(graph.operatorName, rawFindings, runId))
      : scoreFindings(graph.operatorName, rawFindings, runId));

    await db.insert(repEngineFindings).values(
      scored.map((f) => ({
        engagementId,
        engineId: f.engineId,
        promptText: f.promptText,
        responseText: f.responseText,
        sentiment: f.sentiment,
        flagged: f.flagged,
        flagReason: f.flagReason,
      }))
    );

    // audit-log-schema.md's "detection" event — one per scored mention,
    // flagged or not ("A monitored entity was mentioned somewhere and the
    // ingestion/analysis layer scored it," no flagged-only qualifier in
    // the spec). Batched: a full panel run can score up to
    // len(seedPanelPrompts) x activeEngines.length findings in one go.
    await logAuditEventsBatch(
      engagementId,
      scored.map(
        (f): RepAuditEvent => ({
          eventType: "detection",
          payload: {
            source: f.engineId,
            entityMatched: graph.operatorName,
            mentionText: `Q: ${f.promptText}\nA: ${f.responseText}`,
            sentimentLabel: f.sentiment,
            threatCategory: f.flagged ? f.flagReason : null,
          },
        })
      )
    );

    const flaggedCount = scored.filter((f) => f.flagged).length;
    await logStep(runId, {
      phase: "engine_panel",
      status: "success",
      detail: `Recorded ${scored.length} finding(s)${flaggedCount > 0 ? `, ${flaggedCount} flagged` : ""}.`,
    });
    summary.whatWorked.push(`Checked ${activeEngines.length} engine(s) across ${graph.seedPanelPrompts.length} prompt(s).`);
    if (flaggedCount > 0) summary.decisionsMade.push(`${flaggedCount} finding(s) flagged for review.`);
    if (errors.length > 0) summary.whatFailed.push(`${errors.length} engine/prompt quer${errors.length === 1 ? "y" : "ies"} failed or skipped.`);

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