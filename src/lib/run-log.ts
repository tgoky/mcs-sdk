// src/lib/run-log.ts
//
// Single source of truth for instrumenting a skillRuns row.
//
// IMPORTANT — concurrency assumption: logStep() does a read-modify-write
// (SELECT steps, mutate in JS, UPDATE) rather than a pure atomic SQL append.
// This is safe ONLY because every call site in this codebase awaits each
// logStep() call sequentially within a single async function — there is
// never a `Promise.all` (or otherwise concurrent) set of logStep calls
// against the SAME runId anywhere in the app. If that ever changes, this
// file needs to go back to an atomic jsonb `||` concat (and step-pairing/
// auto-close below would need to move to a SQL-side CASE expression
// instead of JS). Don't add concurrent logStep calls for one runId without
// revisiting this.
//
// Usage pattern:
//   const runId = crypto.randomUUID();
//   await startRun({ id: runId, engagementId, skillName: "pin-down", phase: "onboarding_start", label: buyerName });
//   await logStep(runId, { phase: "voice_extraction", status: "running" });
//   ...
//   await logStep(runId, { phase: "voice_extraction", status: "success", detail: "Extracted tone profile" });
//   ...
//   await finishRun(runId, { summary: { ... } });
//   // or, on error:
//   await failRun(runId, err, { summary: { ... } });
//   // or, on cancel:
//   await cancelRun(runId);

import { db } from "@/lib/db";
import { skillRuns } from "@/models/schema";
import { eq } from "drizzle-orm";

export type { RunSummary, RunStep } from "@/models/schema";
import type { RunStep, RunSummary } from "@/models/schema";

export interface StartRunOptions {
  id: string;
  engagementId: string;
  skillName: string;
  phase: string;
  label?: string;
}

/**
 * Inserts the initial skillRuns row.
 *
 * The seeded step entry is a generic, already-closed "run_started" marker
 * (status: "success", completedAt = startedAt) rather than an open-ended
 * entry under the caller's own phase name. Previously this seeded entry
 * used the caller's phase (e.g. "onboarding_start") with status "running",
 * and nothing downstream ever logged that same phase again to close it —
 * so the first row of every run's timeline spun forever. Two skills
 * happened to mask this by coincidentally reusing the same phase string
 * later (leak-map's stage_1_data_pull, pre-call-read's roster_fetch); the
 * other two (pin-down, the booking webhook) did not. This marker design
 * removes the bug at the root instead of patching each call site.
 */
export async function startRun(opts: StartRunOptions): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const startMarker: RunStep = {
    phase: "run_started",
    label: opts.label,
    status: "success",
    startedAt: nowIso,
    completedAt: nowIso,
  };

  await db.insert(skillRuns).values({
    id: opts.id,
    engagementId: opts.engagementId,
    skillName: opts.skillName,
    phase: opts.phase,
    status: "running",
    steps: [startMarker],
    startedAt: now,
  });
}

export interface LogStepOptions {
  phase: string;
  /** Optional human detail for this specific unit of work, e.g. a prospect name. */
  label?: string;
  status?: RunStep["status"];
  /** Free-text outcome, e.g. "Identity confidence 98/100 — brief sent via Slack". */
  detail?: string;
}

/**
 * Appends to, or closes out, an entry in the run's step log, and updates
 * the scalar `phase` column for back-compat with existing phase-based UI
 * lookups (live feed "current action" text, engagement card phase tag).
 *
 * Pairing logic: if the most recent entry in the array with this exact
 * `phase` has status "running", and the new call's status is terminal
 * (success/failed/skipped), that entry is updated IN PLACE (completedAt
 * set, status/detail updated) rather than appending a duplicate row. This
 * is what makes per-step duration possible. Matching is on `phase` alone,
 * not `phase + label` — safe because of the sequential-execution guarantee
 * above: a phase's "running" entry is always closed before the same phase
 * is opened again for the next unit of work (e.g. the next prospect in a
 * pre-call-read batch), so there is never more than one open "running"
 * entry per phase at a time.
 *
 * If no open "running" entry is found for this phase (a one-shot step
 * logged once after the work already finished, e.g. a quick DB read), a
 * new entry is appended with completedAt = startedAt, since the action it
 * describes already happened by the time this call fires.
 */
export async function logStep(runId: string, opts: LogStepOptions): Promise<void> {
  const status = opts.status ?? "running";
  const nowIso = new Date().toISOString();

  const [row] = await db
    .select({ steps: skillRuns.steps })
    .from(skillRuns)
    .where(eq(skillRuns.id, runId))
    .limit(1);

  const steps = (row?.steps ?? []).slice();

  let pairedIndex = -1;
  if (status !== "running") {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].phase === opts.phase && steps[i].status === "running") {
        pairedIndex = i;
        break;
      }
    }
  }

  if (pairedIndex >= 0) {
    steps[pairedIndex] = {
      ...steps[pairedIndex],
      status,
      label: opts.label ?? steps[pairedIndex].label,
      detail: opts.detail ?? steps[pairedIndex].detail,
      completedAt: nowIso,
    };
  } else {
    const entry: RunStep = {
      phase: opts.phase,
      label: opts.label,
      status,
      detail: opts.detail,
      startedAt: nowIso,
      // A one-shot entry (no preceding "running" call) describes work
      // that's already finished by the time we log it — close immediately
      // rather than leaving completedAt unset, which would otherwise read
      // as "still in progress" on the run-detail timeline.
      ...(status !== "running" ? { completedAt: nowIso } : {}),
    };
    steps.push(entry);
  }

  await db
    .update(skillRuns)
    .set({ phase: opts.phase, steps })
    .where(eq(skillRuns.id, runId));
}

export interface FinishRunOptions {
  summary?: RunSummary;
}

/**
 * Closes out any step entries still marked "running" — a safety net for
 * cases where an exception interrupts a step before its closing logStep()
 * call fires, or a future developer adds a new step and forgets to close
 * it (exactly the class of bug this replaced). Returns the corrected
 * array; does not write to the DB itself.
 */
function closeDanglingSteps(
  steps: RunStep[],
  outcome: "success" | "failed" | "cancelled"
): RunStep[] {
  const nowIso = new Date().toISOString();
  const interruptedDetail =
    outcome === "failed"
      ? "Interrupted — the run failed before this step finished."
      : outcome === "cancelled"
      ? "Interrupted — the run was cancelled before this step finished."
      : undefined;
  return steps.map((s) =>
    s.status === "running"
      ? { ...s, status: outcome, detail: s.detail ?? interruptedDetail, completedAt: nowIso }
      : s
  );
}

/** Marks a run as successfully completed and writes the final five-field summary, if provided. */
export async function finishRun(runId: string, opts: FinishRunOptions = {}): Promise<void> {
  const [row] = await db
    .select({ steps: skillRuns.steps })
    .from(skillRuns)
    .where(eq(skillRuns.id, runId))
    .limit(1);

  const steps = closeDanglingSteps(row?.steps ?? [], "success");

  await db
    .update(skillRuns)
    .set({
      status: "success",
      completedAt: new Date(),
      steps,
      ...(opts.summary ? { summary: opts.summary } : {}),
    })
    .where(eq(skillRuns.id, runId));
}

/**
 * Marks a run as failed, persisting the actual error message (this was
 * previously console.error'd and discarded in every catch block in the
 * app) plus whatever partial five-field summary the caller had assembled
 * before the failure. Also closes out whichever step was mid-flight when
 * the error hit, so the timeline shows exactly where the run broke instead
 * of leaving a step permanently spinning on a run that's already failed.
 */
export async function failRun(
  runId: string,
  err: unknown,
  opts: FinishRunOptions = {}
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);

  try {
    const [row] = await db
      .select({ steps: skillRuns.steps })
      .from(skillRuns)
      .where(eq(skillRuns.id, runId))
      .limit(1);

    const steps = closeDanglingSteps(row?.steps ?? [], "failed");

    await db
      .update(skillRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
        steps,
        ...(opts.summary ? { summary: opts.summary } : {}),
      })
      .where(eq(skillRuns.id, runId));
  } catch {
    // Swallow — if even this write fails (e.g. DB connection lost), there's
    // nowhere left to surface it. The caller's own catch still rethrows.
  }
}

/**
 * Marks a run as cancelled by user request. Called directly from the cancel
 * API route the moment the user clicks Cancel — doesn't wait for Inngest's
 * cancelOn match, which can lag behind by however long the current step
 * takes to finish. The DB row should reflect "cancelled" immediately.
 */
export async function cancelRun(runId: string): Promise<void> {
  const [row] = await db
    .select({ steps: skillRuns.steps })
    .from(skillRuns)
    .where(eq(skillRuns.id, runId))
    .limit(1);

  const steps = closeDanglingSteps(row?.steps ?? [], "cancelled");

  await db
    .update(skillRuns)
    .set({ status: "cancelled", completedAt: new Date(), steps })
    .where(eq(skillRuns.id, runId));
}

/** Small helper for building up a RunSummary incrementally across a function body. */
export function emptySummary(): RunSummary {
  return {
    whatWasAttempted: [],
    whatWorked: [],
    whatFailed: [],
    openItems: [],
    decisionsMade: [],
  };
}