// src/lib/run-log.ts
//
// Single source of truth for instrumenting a skillRuns row.
//
// Concurrency: logStep()/finishRun()/failRun()/cancelRun() all do a
// read-modify-write on the same `steps` jsonb column (SELECT steps, mutate
// in JS, UPDATE). Previously this was a plain SELECT + UPDATE with a
// comment asserting it was safe only because every call site in this
// codebase happens to await each call sequentially for a given runId — a
// real constraint, but an unenforced one: nothing stops a future retry
// path, a webhook re-delivery racing a normal step write, or the stale-run
// reaper firing at the same moment as a genuinely-still-running step from
// violating it, and the failure mode is silent (whichever write lands
// second clobbers the other's steps entirely, no error).
//
// This now wraps the SELECT+UPDATE pair in a transaction with
// `SELECT ... FOR UPDATE`, so a second writer for the same runId blocks on
// Postgres's row lock until the first transaction commits, then reads the
// first writer's result rather than a stale copy — a real compare-and-swap
// instead of a documented convention. See withStepsLock() below.
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
import { skillRuns, engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { skillName as skillDisplayName } from "@/lib/copy";

export type { RunSummary, RunStep } from "@/models/schema";
import type { RunStep, RunSummary } from "@/models/schema";

/**
 * Fires the "your run broke / timed out" notification. Called from
 * failRun() and timeoutRun() below — deliberately NOT called from
 * cancelRun(), since that path only ever runs when the buyer themselves
 * clicked Cancel (see src/app/api/skill-runs/[id]/cancel/route.ts). They
 * already know; notifying them about their own action would just be noise.
 *
 * Isolated in its own try/catch so a notification failure (bad Slack URL,
 * DB hiccup) can never mask or interrupt the run-outcome write that
 * already happened above it.
 */
export async function notifyRunOutcome(
  engagementId: string,
  runId: string,
  skillName: string,
  type: "run_failed" | "run_timed_out",
  detail: string
): Promise<void> {
  try {
    const [tenant] = await db
      .select({ whopUserId: engagements.whopUserId, stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .limit(1);
    if (!tenant) return;

    const label = skillDisplayName(skillName as any) ?? skillName;
    const title =
      type === "run_failed"
        ? `${label} run failed`
        : `${label} run timed out`;

    await notifyUser({
      whopUserId: tenant.whopUserId,
      engagementId,
      runId,
      type,
      severity: "critical",
      title,
      body: detail,
      slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
    });
  } catch (e) {
    console.error("[run-log] failed to dispatch run-outcome notification:", e);
  }
}

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

/**
 * Runs `mutate` against the current row for `runId` inside a transaction
 * that holds a row lock (`SELECT ... FOR UPDATE`) for the duration. A
 * second concurrent call for the same runId blocks at the SELECT until the
 * first transaction commits, then sees the first call's write — not a
 * stale pre-write copy — closing the lost-update race the previous plain
 * SELECT+UPDATE had.
 *
 * `mutate` receives the locked row (or null if the runId doesn't exist)
 * and returns the full column set to write, or null to skip writing
 * entirely (e.g. a "someone else already resolved this" bail-out).
 * engagementId/skillName are included alongside steps because failRun
 * needs them after the transaction commits to fire a notification (a real
 * network call, deliberately kept outside the transaction/lock).
 */
async function withStepsLock<
  Cols extends Partial<typeof skillRuns.$inferInsert>
>(
  runId: string,
  mutate: (
    row: { steps: RunStep[]; engagementId: string; skillName: string } | null
  ) => Cols | null
): Promise<{ steps: RunStep[]; engagementId: string; skillName: string } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        steps: skillRuns.steps,
        engagementId: skillRuns.engagementId,
        skillName: skillRuns.skillName,
      })
      .from(skillRuns)
      .where(eq(skillRuns.id, runId))
      .for("update")
      .limit(1);

    const normalizedRow = row
      ? { steps: row.steps ?? [], engagementId: row.engagementId, skillName: row.skillName }
      : null;

    const nextCols = mutate(normalizedRow);
    if (nextCols) {
      await tx.update(skillRuns).set(nextCols).where(eq(skillRuns.id, runId));
    }

    return normalizedRow;
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

  await withStepsLock(runId, (row) => {
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

    return { phase: opts.phase, steps };
  });
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
  await withStepsLock(runId, (row) => {
    const steps = closeDanglingSteps(row?.steps ?? [], "success");
    return {
      status: "success",
      completedAt: new Date(),
      steps,
      ...(opts.summary ? { summary: opts.summary } : {}),
    };
  });
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
    const row = await withStepsLock(runId, (row) => {
      const steps = closeDanglingSteps(row?.steps ?? [], "failed");
      return {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
        steps,
        ...(opts.summary ? { summary: opts.summary } : {}),
      };
    });

    // Silence is the whole trust problem this fixes: before this line, a
    // failed run was only discoverable by opening the dashboard. See
    // notifyRunOutcome() above.
    if (row?.engagementId) {
      await notifyRunOutcome(
        row.engagementId,
        runId,
        row.skillName,
        "run_failed",
        errorMessage
      );
    }
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
  await withStepsLock(runId, (row) => {
    const steps = closeDanglingSteps(row?.steps ?? [], "cancelled");
    return { status: "cancelled", completedAt: new Date(), steps };
  });
}

/**
 * Marks a run as timed out — closed by the stale-run reaper cron (see
 * staleRunReaperCron in src/inngest/crons.ts) rather than by the user
 * clicking Cancel. Distinct from cancelRun() in two ways:
 *   1. Status is "timed_out", not "cancelled" — the run-detail UI and any
 *      future analytics should be able to tell "the buyer stopped this"
 *      apart from "the platform gave up on this."
 *   2. This DOES notify the tenant (cancelRun() deliberately does not —
 *      see notifyRunOutcome() above). A run sitting at "running" forever
 *      with no notification is exactly the silent-failure trust gap this
 *      whole reaper exists to close.
 *
 * RunStep's `status` union doesn't include "timed_out" (see schema.ts) —
 * dangling steps are closed as "cancelled" at the step level, since
 * "interrupted before finishing" is accurate regardless of who/what ended
 * the run. Only the top-level skillRuns.status column (plain text, no
 * enum constraint) gets the more specific "timed_out" value.
 */
/**
 * DB-only half of closing a stale run: the SELECT+UPDATE with no network
 * call. Returns what's needed to notify separately, or null if the race
 * was lost (run resolved on its own between scan and write) or if it
 * wasn't actually closed for any other reason.
 *
 * Split out from timeoutRun so staleRunReaperCron can do this for every
 * stuck run inside one cheap step.run() (pure DB writes, no timeout risk
 * regardless of how many runs are stuck), then fan out the one real
 * network call — the notification — to a separate invocation per run.
 * Same reasoning as the credential-health/lost-deal-sweep/weekly-metrics
 * split from the previous round: a loop is fine when it's DB-only, and
 * becomes a serverless-timeout risk specifically once real network calls
 * enter the loop.
 */
export async function closeStaleRun(
  runId: string
): Promise<{ engagementId: string; skillName: string } | null> {
  const [row] = await db
    .select({
      engagementId: skillRuns.engagementId,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
    })
    .from(skillRuns)
    .where(eq(skillRuns.id, runId))
    .limit(1);

  // Already resolved (succeeded/failed/cancelled) between the reaper's scan
  // and this call — a normal, harmless race given the two are separate
  // round-trips. Bail out rather than overwrite a legitimate terminal
  // status with "timed_out".
  if (!row || row.status !== "running") {
    return null;
  }

  // Deliberately does NOT touch the `steps` column, unlike failRun's
  // closeDanglingSteps. logStep()/finishRun()/failRun()/cancelRun() (above)
  // now take a `SELECT ... FOR UPDATE` row lock via withStepsLock() before
  // reading/writing `steps`, so a genuinely-still-running run calling
  // logStep() at the same moment the reaper tries to close it will simply
  // have this transaction wait for that lock rather than racing it — but
  // extending that same lock to closeStaleRun would mean this function
  // blocks on a run that might legitimately be mid-step for a long time,
  // which defeats the point of the reaper being fast and cheap. Instead
  // this stays a simple, lock-free, status-guarded UPDATE (see below) and
  // only ever touches the top-level `status` column, never `steps` —
  // avoiding the conflict entirely rather than serializing against it.
  const updated = await db
    .update(skillRuns)
    .set({ status: "timed_out", completedAt: new Date() })
    .where(and(eq(skillRuns.id, runId), eq(skillRuns.status, "running")))
    .returning({ id: skillRuns.id });

  if (updated.length === 0) {
    // Lost the race between the read and the write — nothing to notify
    // about for a timeout that didn't actually happen.
    return null;
  }

  return row.engagementId ? { engagementId: row.engagementId, skillName: row.skillName } : null;
}

/**
 * Does-everything version — kept for the manual on-demand route
 * (/api/crons/stale-run-reaper), where a human explicitly triggered it and
 * there's no serverless-timeout concern the way there is for a scheduled
 * cron running unattended at scale. The scheduled cron (staleRunReaperCron)
 * does NOT call this — it calls closeStaleRun in its fast prep step, then
 * fans out one notification per reaped run separately.
 */
export async function timeoutRun(runId: string): Promise<boolean> {
  const closed = await closeStaleRun(runId);
  if (!closed) return false;

  await notifyRunOutcome(
    closed.engagementId,
    runId,
    closed.skillName,
    "run_timed_out",
    "This run sat in \"running\" longer than its allowed ceiling and was closed automatically. If this keeps happening for the same module, it usually means an upstream API call is hanging — check the run's step timeline for where it stalled."
  );

  return true;
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