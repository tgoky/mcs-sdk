// src/inngest/crons.ts
//
// Scheduling used to live in vercel.json as Vercel Cron Jobs, which hit
// these routes: /api/crons/nightly-briefs, /api/crons/leak-map-audit, and
// /api/crons/alert-monitor. That's a real problem on the Vercel Hobby
// (free) plan: Hobby accounts are hard-capped at cron expressions that
// resolve to once per day or less — anything more frequent FAILS AT
// DEPLOY TIME, not silently at runtime. Our alert-monitor schedule,
// "0 */6 * * *" (four times a day), would never have deployed on Hobby.
// (Source: vercel.com/docs/cron-jobs/usage-and-pricing, checked today.)
//
// Inngest solves this natively: a `cron`-triggered Inngest function is
// invoked by Inngest's own scheduler over HTTP, calling the same
// /api/inngest endpoint every other Inngest event already uses. Vercel
// never sees a cron entry for it, so Vercel's plan tier is irrelevant.
// (Source: inngest.com/docs/guides/scheduled-functions +
// inngest.com/uses/scheduled-jobs, both checked today — "Inngest triggers
// scheduled jobs via HTTP ... Vercel's built-in cron limits don't apply.")
// Inngest's own free/Hobby plan includes 50,000 executions/month, which a
// handful of daily/weekly/monthly/6-hourly crons across a small tenant
// base won't come close to.
//
// The /api/crons/* routes are kept as manually-triggerable, CRON_SECRET-
// protected endpoints (useful for one-off backfills or external
// monitoring), but nothing schedules them anymore — vercel.json's `crons`
// block has been removed. These four functions are now the only thing
// that fires this work on a schedule.
import crypto from "crypto";
import { inngest, skillRunExecute, skillRunCancel, credentialHealthCheckSingle, lostDealSweepEngagement, weeklyMetricsEngagement } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { startRun, timeoutRun } from "@/lib/run-log";
import { evaluateActiveAlertMonitor } from "@/features/leak-map/server/alert-monitor";
import { findCredentialsNeedingCheck, checkSingleCredential } from "@/features/notifications/server/credential-health";
import { markElapsedEnrollmentsLost, processLostDealsForEngagement } from "@/features/win-back/server/lost-deal-sweep";
import { findEngagementsForWeeklyReadout, processWeeklyMetricsForEngagement } from "@/features/pile-on/server/weekly-metrics";
import { and, eq, lt } from "drizzle-orm";

// Each function does its DB read + per-tenant startRun bookkeeping inside
// ONE step.run(), then fans out via a SINGLE step.sendEvent() carrying the
// whole batch. Putting step.run() inside the tenant loop instead (one step
// per tenant) is the anti-pattern Inngest's own docs warn about — it burns
// toward the 1000-steps-per-function ceiling as the tenant base grows, for
// no benefit here since none of these calls need independent retry
// boundaries. The actual per-tenant work still gets full retry isolation,
// just one level down, in executeSkillRun (src/inngest/skill.ts) — that's
// what each fanned-out event triggers.

export const nightlyBriefsCron = inngest.createFunction(
  { id: "nightly-briefs-cron", triggers: [{ cron: "TZ=UTC 0 20 * * *" }] }, // 20:00 UTC daily
  async ({ step }) => {
    const prepared = await step.run("prepare-nightly-runs", async () => {
      const all = await db.select().from(engagements);
      // Only engagements that finished Pin-Down (booking platform wired
      // up) have anything to brief tonight.
      const eligible = all.filter((t) => {
        const stack = t.stack as any;
        return stack?.booking_platform && stack?.booking_platform_credentials_ref;
      });

      const out: { runId: string; engagementId: string }[] = [];
      for (const tenant of eligible) {
        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: tenant.engagementId,
          skillName: "pre-call-read",
          phase: "roster_fetch",
          label: "Nightly cron (Inngest)",
        });
        out.push({ runId, engagementId: tenant.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-nightly-briefs",
        prepared.map((r) =>
          skillRunExecute.create({
            runId: r.runId,
            engagementId: r.engagementId,
            skillName: "pre-call-read",
          })
        )
      );
    }

    return { dispatched: prepared.length };
  }
);

export const weeklyLeakMapCron = inngest.createFunction(
  { id: "weekly-leak-map-cron", triggers: [{ cron: "TZ=UTC 0 9 * * 1" }] }, // Monday 09:00 UTC
  async ({ step }) => {
    const prepared = await step.run("prepare-weekly-audits", async () => {
      const targets = await db.select().from(engagements);
      const out: { runId: string; engagementId: string }[] = [];
      for (const tenant of targets) {
        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: tenant.engagementId,
          skillName: "leak-map",
          phase: "stage_1_data_pull",
          label: "Weekly cron (Inngest)",
        });
        out.push({ runId, engagementId: tenant.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-weekly-audits",
        prepared.map((r) =>
          skillRunExecute.create({
            runId: r.runId,
            engagementId: r.engagementId,
            skillName: "leak-map",
            auditType: "weekly",
          })
        )
      );
    }

    return { dispatched: prepared.length };
  }
);

export const monthlyLeakMapCron = inngest.createFunction(
  { id: "monthly-leak-map-cron", triggers: [{ cron: "TZ=UTC 0 9 1 * *" }] }, // 1st of month, 09:00 UTC
  async ({ step }) => {
    const prepared = await step.run("prepare-monthly-audits", async () => {
      const targets = await db.select().from(engagements);
      const out: { runId: string; engagementId: string }[] = [];
      for (const tenant of targets) {
        const runId = crypto.randomUUID();
        await startRun({
          id: runId,
          engagementId: tenant.engagementId,
          skillName: "leak-map",
          phase: "stage_1_data_pull",
          label: "Monthly cron (Inngest)",
        });
        out.push({ runId, engagementId: tenant.engagementId });
      }
      return out;
    });

    if (prepared.length > 0) {
      await step.sendEvent(
        "dispatch-monthly-audits",
        prepared.map((r) =>
          skillRunExecute.create({
            runId: r.runId,
            engagementId: r.engagementId,
            skillName: "leak-map",
            auditType: "monthly",
          })
        )
      );
    }

    return { dispatched: prepared.length };
  }
);

// This is the one that would have failed Vercel's own deploy check on
// Hobby — 4x/day is more than Hobby's once-per-day ceiling allows.
export const alertMonitorCron = inngest.createFunction(
  { id: "alert-monitor-cron", triggers: [{ cron: "0 */6 * * *" }] }, // every 6 hours
  async ({ step }) => {
    const actionsTriggered = await step.run("evaluate-active-alerts", () =>
      evaluateActiveAlertMonitor()
    );
    return { actionsTriggered };
  }
);

// How long a run is allowed to sit at status="running" before the reaper
// treats it as stuck rather than legitimately long-running. Deliberately
// generous relative to the 45s per-request checkpoint window in
// src/lib/inngest.ts, since a single run can checkpoint-resume many times
// over its real lifetime (e.g. pre-call-read looping a full roster).
// Override per-deployment via env if a given skill genuinely needs more.
const STALE_RUN_CEILING_MS =
  Number(process.env.STALE_RUN_CEILING_MINUTES ?? 120) * 60 * 1000;

/**
 * Stale-run reaper.
 *
 * Closes any skillRuns row that's been stuck at status="running" past
 * STALE_RUN_CEILING_MS — the janitor for the case where a serverless
 * function died mid-run (or someone killed `pnpm dev` at exactly the wrong
 * moment locally) and left a row that will never update on its own. Before
 * this existed, the run-detail page's 3s poll would spin on that row
 * indefinitely, and nothing ever told the buyer their automation was dead.
 *
 * Runs every 15 minutes — frequent enough that a stuck run doesn't sit
 * silently for hours, cheap enough that it's a non-issue against Inngest's
 * free-tier execution allowance.
 *
 * NOTE — same class of issue as the three crons below, not yet fixed here:
 * timeoutRun() calls notifyRunOutcome() per reaped run, which does a real
 * Slack/email network call. At the volume this cron is designed for (rare
 * stale runs, not a large recurring batch), the risk is much smaller than
 * the three below — but if stale runs ever pile up in bulk (e.g. after an
 * outage), this loop has the same "one giant step" shape. Deprioritized
 * this round given its lower likelihood; worth the same fan-out treatment
 * if it ever becomes a real problem.
 */
export const staleRunReaperCron = inngest.createFunction(
  { id: "stale-run-reaper-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const reapedRunIds = await step.run("reap-stale-runs", async () => {
      const cutoff = new Date(Date.now() - STALE_RUN_CEILING_MS);
      const stuck = await db
        .select({ id: skillRuns.id })
        .from(skillRuns)
        .where(and(eq(skillRuns.status, "running"), lt(skillRuns.startedAt, cutoff)));

      // timeoutRun() re-checks status="running" at write time and returns
      // false if the run resolved on its own between this scan and the
      // update (a normal race given they're separate round-trips). Only
      // ids it actually closed get cancelled/reported below — otherwise a
      // run that just succeeded could get an incorrect cancel event fired
      // at it a few hundred ms later.
      const reaped: string[] = [];
      for (const run of stuck) {
        const wasReaped = await timeoutRun(run.id); // closes the row AND notifies the buyer
        if (wasReaped) reaped.push(run.id);
      }
      return reaped;
    });

    // Belt-and-suspenders: also tell Inngest to cancel the underlying
    // execution via the same cancelOn wiring the manual Cancel button uses
    // (src/inngest/skill.ts), in case it's somehow still alive after a long
    // checkpoint gap. The DB row is already closed regardless of whether
    // this lands — same reasoning as the cancel route not waiting on it.
    if (reapedRunIds.length > 0) {
      await step.sendEvent(
        "cancel-stale-runs",
        reapedRunIds.map((runId) => skillRunCancel.create({ runId }))
      );
    }

    return { reaped: reapedRunIds.length };
  }
);

/**
 * Daily credential health check.
 *
 * Proactively validates every credential we have a verified endpoint for
 * (see VALIDATORS in credential-health.ts) and notifies the buyer the
 * moment one goes from working to broken — instead of the first sign of
 * trouble being a cryptic API error buried in a failed run three days
 * later.
 *
 * Fixed: originally ran every credential's real network validation call
 * inside one step.run() looping across every tenant. Inngest's
 * checkpointing only yields back to reschedule a continuation AT a step
 * boundary — with one giant step, there's no boundary until the whole
 * loop finishes, so none of the "survives a serverless timeout" benefit
 * was actually happening as the credential count grows. Now: cheap
 * DB-only prep in one step, then one checkSingleCredentialHealthCron
 * invocation per credential, each with its own execution window.
 */
export const credentialHealthCron = inngest.createFunction(
  { id: "credential-health-cron", triggers: [{ cron: "TZ=UTC 0 13 * * *" }] }, // 13:00 UTC daily
  async ({ step }) => {
    const ids = await step.run("find-credentials-needing-check", () => findCredentialsNeedingCheck());

    if (ids.length > 0) {
      await step.sendEvent(
        "dispatch-credential-checks",
        ids.map((credentialId) => credentialHealthCheckSingle.create({ credentialId }))
      );
    }

    return { dispatched: ids.length };
  }
);

/** Fanned-out handler: the one real network call per invocation. */
export const checkSingleCredentialHealthCron = inngest.createFunction(
  { id: "check-single-credential-health", triggers: [credentialHealthCheckSingle] },
  async ({ event }) => {
    return checkSingleCredential(event.data.credentialId);
  }
);

/**
 * Daily lost-deal sweep.
 *
 * Closes the gap winBackCounts.lost_count sat unused for: finds every
 * win-back enrollment whose recovery window elapsed without a rebook,
 * marks it lost, generates the long-term nurture content once per
 * engagement, and auto-enrolls where a Klaviyo list is configured. See
 * src/features/win-back/server/lost-deal-sweep.ts for the full mechanics.
 *
 * Fixed: same single-step architectural issue as credentialHealthCron
 * above. The DB-only "find elapsed enrollments, mark lost, increment
 * counts" work stays in one cheap step.run(); the slow parts (an LLM call
 * for nurture generation, Klaviyo enrollment, notification) now run one
 * per engagement in their own fanned-out invocation.
 */
export const lostDealSweepCron = inngest.createFunction(
  { id: "lost-deal-sweep-cron", triggers: [{ cron: "TZ=UTC 0 14 * * *" }] }, // 14:00 UTC daily
  async ({ step }) => {
    const { markedLost, byEngagement } = await step.run("mark-elapsed-enrollments-lost", () =>
      markElapsedEnrollmentsLost()
    );

    if (byEngagement.length > 0) {
      await step.sendEvent(
        "dispatch-lost-deal-processing",
        byEngagement.map(({ engagementId, enrollmentIds }) =>
          lostDealSweepEngagement.create({ engagementId, enrollmentIds })
        )
      );
    }

    return { markedLost, engagementsDispatched: byEngagement.length };
  }
);

/** Fanned-out handler: nurture generation (LLM call) + Klaviyo enrollment + notify, one engagement at a time. */
export const processLostDealEngagementCron = inngest.createFunction(
  { id: "process-lost-deal-engagement", triggers: [lostDealSweepEngagement] },
  async ({ event }) => {
    return processLostDealsForEngagement(event.data.engagementId, event.data.enrollmentIds);
  }
);

/**
 * Weekly Monday metrics readout — opening metrics, list sizes, and a
 * simple booking-volume anomaly flag, delivered per-engagement via
 * notifyUser. Matches the original spec's "wakes up every Monday morning
 * at 08:00" cadence exactly. See weekly-metrics.ts for what "metrics"
 * honestly means here and why.
 *
 * Fixed: same single-step architectural issue as the two crons above.
 * The DB-only "which engagements have anything to report" computation
 * stays in one cheap step.run(); the slow part (Klaviyo list-size lookups
 * + notification) now runs one per engagement in its own fanned-out
 * invocation.
 */
export const weeklyMetricsCron = inngest.createFunction(
  { id: "weekly-metrics-cron", triggers: [{ cron: "TZ=UTC 0 8 * * 1" }] }, // Monday 08:00 UTC
  async ({ step }) => {
    const eligible = await step.run("find-engagements-for-weekly-readout", () =>
      findEngagementsForWeeklyReadout()
    );

    if (eligible.length > 0) {
      await step.sendEvent(
        "dispatch-weekly-metrics",
        eligible.map((engagementId) => weeklyMetricsEngagement.create({ engagementId }))
      );
    }

    return { dispatched: eligible.length };
  }
);

/** Fanned-out handler: Klaviyo list-size lookups + notification, one engagement at a time. */
export const processWeeklyMetricsEngagementCron = inngest.createFunction(
  { id: "process-weekly-metrics-engagement", triggers: [weeklyMetricsEngagement] },
  async ({ event }) => {
    return processWeeklyMetricsForEngagement(event.data.engagementId);
  }
);