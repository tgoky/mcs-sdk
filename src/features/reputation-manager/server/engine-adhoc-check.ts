// src/features/reputation-manager/server/engine-adhoc-check.ts
//
// Teammates chat's "ask the AI engines something right now" action —
// rep-engine-adhoc-check in chat-skill-registry.ts. Reuses queryEngine
// exactly as-is from engine-panel-service.ts (same engine selection,
// same call shape) but deliberately does NOT insert into
// repEngineFindings the way the scheduled panel run does — that table is
// this client's own persisted monitoring history, and writing a
// competitor's answers into it (or an off-script one-off question that
// isn't part of the client's locked seed panel) would corrupt what that
// table is supposed to mean. This is a live, ephemeral snapshot: the
// answers are relayed straight into the run's own summary (visible via
// get_run_history / the run detail page, same "check back for results"
// convention every other chat-dispatched skill already uses), nothing
// written to the client's monitoring tables.
//
// Two real capabilities in one action, since they're the same mechanism
// with a different subject: an ad-hoc question about the client
// themselves (subject omitted, defaults to their own operatorName), or
// the exact same question aimed at a named competitor already tracked in
// their identity graph. A competitor name that doesn't match one on file
// is rejected with the real list of tracked names rather than silently
// running a query for a possibly-mistyped or hallucinated competitor.

import { db } from "@/lib/db";
import { repIdentityGraphs } from "@/models/schema";
import { eq } from "drizzle-orm";
import { queryEngine } from "./engine-panel-service";
import { REP_ENGINE_IDS, REP_ENGINE_LABELS, resolveEngineModel } from "@/features/reputation-manager/engine-models";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runRepEngineAdhocCheck(
  tenant: { engagementId: string },
  runId: string,
  step: StepTools | undefined,
  ctx?: { engineCheckSubject?: string; engineCheckQuestion?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const graph = await run("load-identity-graph", async () => {
      const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, tenant.engagementId)).limit(1);
      return row ?? null;
    });

    if (!graph) {
      throw new Error("Reputation Manager's Identity Setup hasn't been completed for this client yet — there's no operator name or competitor list to check against.");
    }

    const requestedSubject = ctx?.engineCheckSubject?.trim();
    let subject: string;
    if (!requestedSubject || requestedSubject.toLowerCase() === graph.operatorName.toLowerCase()) {
      subject = graph.operatorName;
    } else {
      const match = graph.competitors.find((c) => c.name.toLowerCase() === requestedSubject.toLowerCase());
      if (!match) {
        const known = graph.competitors.map((c) => c.name).join(", ") || "(none tracked yet)";
        throw new Error(`"${requestedSubject}" isn't a competitor on file for this client. Tracked competitors: ${known}.`);
      }
      subject = match.name;
    }

    const question = ctx?.engineCheckQuestion?.trim() || `What do people generally say about ${subject}? Is there anything concerning associated with them?`;

    const configuredEngines = REP_ENGINE_IDS.filter((id) => resolveEngineModel(id) !== null);
    const activeEngines = graph.activeEngines ? configuredEngines.filter((id) => graph.activeEngines!.includes(id)) : configuredEngines;

    if (activeEngines.length === 0) {
      throw new Error(
        configuredEngines.length === 0
          ? "No AI engines have a model configured for this workspace."
          : "This client's active-engines selection doesn't match any configured engine."
      );
    }

    await logStep(runId, {
      phase: "engine_adhoc_check",
      status: "running",
      detail: `Asking ${activeEngines.length} engine(s) about ${subject}.`,
      label: subject,
    });

    const results = await run("query-engines", () =>
      Promise.all(activeEngines.map((engineId) => queryEngine(engineId, subject, question, runId)))
    );

    const answered = results.filter((r): r is { engineId: (typeof activeEngines)[number]; promptText: string; responseText: string } => !("error" in r));
    const errored = results.filter((r): r is { error: string; engineId: (typeof activeEngines)[number] } => "error" in r);

    for (const a of answered) {
      const truncated = a.responseText.length > 400 ? `${a.responseText.slice(0, 400)}…` : a.responseText;
      summary.whatWorked.push(`${REP_ENGINE_LABELS[a.engineId]} on ${subject}: ${truncated}`);
    }
    for (const e of errored) {
      summary.whatFailed.push(e.error);
    }

    if (answered.length === 0) {
      throw new Error("Every engine query failed — nothing to report.");
    }

    await logStep(runId, {
      phase: "engine_adhoc_check",
      status: "success",
      detail: `Got ${answered.length} of ${activeEngines.length} answer(s) about ${subject}.`,
    });

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
