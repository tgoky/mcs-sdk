// src/features/reputation-manager/server/crisis-stress-test.ts
//
// Teammates chat's "would this cross our crisis threshold" action —
// rep-crisis-stress-test in chat-skill-registry.ts. Reuses scoreFindings
// exactly as-is from crisis-response-service.ts (now exported for this
// reuse) — the same LLM scoring rubric and the same code-computed
// composite-score weights the real crisis run uses, so the answer this
// gives is genuinely what the real pipeline would decide, not a
// simplified approximation of it.
//
// Deliberately never writes a repIncidents row and never calls
// notifyUser — this tests the threshold against a hypothetical, it does
// not declare a real incident or page anyone. If the hypothetical would
// actually trigger, the reply says so; nothing downstream of that
// decision happens.

import { db } from "@/lib/db";
import { repIdentityGraphs } from "@/models/schema";
import { eq } from "drizzle-orm";
import { scoreFindings, type ContributingFinding } from "./crisis-response-service";
import { resolveCrisisScoreFloor } from "@/features/reputation-manager/rep-thresholds";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const VALID_SOURCES: ContributingFinding["source"][] = ["engine_panel", "trustpilot", "reddit", "twitter"];

export async function runCrisisStressTest(
  tenant: { engagementId: string },
  runId: string,
  step: StepTools | undefined,
  ctx?: { hypotheticalFindingText?: string; hypotheticalFindingSource?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const findingText = ctx?.hypotheticalFindingText?.trim();
    if (!findingText) {
      throw new Error("No hypothetical finding text was provided to test.");
    }

    const rawSource = ctx?.hypotheticalFindingSource?.trim().toLowerCase();
    const source: ContributingFinding["source"] = (VALID_SOURCES as string[]).includes(rawSource ?? "")
      ? (rawSource as ContributingFinding["source"])
      : "trustpilot";

    const graph = await run("load-identity-graph", async () => {
      const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, tenant.engagementId)).limit(1);
      return row ?? null;
    });

    if (!graph) {
      throw new Error("Reputation Manager's Identity Setup hasn't been completed for this client yet — there's no threshold to test against.");
    }

    const hypothetical: ContributingFinding = { source, excerpt: findingText, flagReason: null };

    await logStep(runId, { phase: "crisis_stress_test", status: "running", detail: "Scoring the hypothetical finding." });

    const assessment = await run("score-hypothetical", () => scoreFindings(graph.operatorName, [hypothetical], runId));
    const floor = resolveCrisisScoreFloor(graph.crisisThresholdOverride);
    const forceTriggerClass = assessment.forceTriggerClass;
    const wouldTrigger = forceTriggerClass !== null || assessment.severityScore >= floor;

    const scoredDetail = assessment.scored[0];
    const axisDetail = scoredDetail
      ? `reach ${scoredDetail.reach}/10, sentiment ${scoredDetail.sentiment}/10, permanence ${scoredDetail.permanence}/10`
      : "no per-axis breakdown";

    await logStep(runId, {
      phase: "crisis_stress_test",
      status: "success",
      detail: `Severity ${assessment.severityScore}/100 vs. threshold ${floor}. ${wouldTrigger ? "Would trigger." : "Would not trigger."}`,
    });

    summary.whatWorked.push(
      `Tested a hypothetical ${source} finding: "${findingText.slice(0, 150)}${findingText.length > 150 ? "…" : ""}" — severity ${assessment.severityScore}/100 (${axisDetail}), this client's threshold is ${floor}.`
    );
    summary.decisionsMade.push(
      wouldTrigger
        ? `Would trigger an incident${forceTriggerClass ? ` (force-trigger class: ${forceTriggerClass})` : ` — severity ${assessment.severityScore} meets or exceeds the ${floor} threshold`}. No real incident was declared — this was a test only.`
        : `Would NOT trigger an incident — severity ${assessment.severityScore} is below the ${floor} threshold and no force-trigger class applied.`
    );

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
