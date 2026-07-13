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
import { inngest, skillRunExecute, skillRunCancel, credentialHealthCheckSingle, lostDealSweepEngagement, weeklyMetricsEngagement, staleRunNotify, bookingPollEngagement, dynamicBriefEngagement } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { startRun, closeStaleRun, notifyRunOutcome, failRun } from "@/lib/run-log";
import { evaluateActiveAlertMonitor } from "@/features/leak-map/server/alert-monitor";
import { findCredentialsNeedingCheck, checkSingleCredential } from "@/features/notifications/server/credential-health";
import { markElapsedEnrollmentsLost, processLostDealsForEngagement } from "@/features/win-back/server/lost-deal-sweep";
import { findEngagementsForWeeklyReadout, processWeeklyMetricsForEngagement } from "@/features/pile-on/server/weekly-metrics";
import { findEngagementsDueForPoll, pollBookingsForEngagement } from "@/features/pin-down/server/booking-poller";
import { validateAllPlatformDocsLinks } from "@/features/pin-down/server/docs-link-validator";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
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
  return (
    stack?.booking_platform &&
    stack?.booking_platform_credentials_ref &&
    // ✅ Exclude dynamic polling clients so they don't get double-processed at night
    stack?.brief_trigger_type !== "dynamic_webhook"
  );
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
 * Fixed: previously called timeoutRun() (DB write + notification together)
 * inside the loop in the main step.run(), same single-step shape as the
 * three crons below before their fix. closeStaleRun() (DB-only, no network
 * call) now runs in the loop instead — safe regardless of how many runs
 * are stuck, since it's pure DB writes — and the one real network call per
 * run (the notification) is fanned out to notifyStaleRunCron below.
 */
export const staleRunReaperCron = inngest.createFunction(
  { id: "stale-run-reaper-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const reaped = await step.run("reap-stale-runs", async () => {
      const cutoff = new Date(Date.now() - STALE_RUN_CEILING_MS);
      const stuck = await db
        .select({ id: skillRuns.id })
        .from(skillRuns)
        .where(and(eq(skillRuns.status, "running"), lt(skillRuns.startedAt, cutoff)));

      // closeStaleRun() re-checks status="running" at write time and
      // returns null if the run resolved on its own between this scan and
      // the update (a normal race given they're separate round-trips).
      // Only ones it actually closed get cancelled/notified below —
      // otherwise a run that just succeeded could get an incorrect cancel
      // event or timeout notification fired at it a few hundred ms later.
      const out: { runId: string; engagementId: string; skillName: string }[] = [];
      for (const run of stuck) {
        const closed = await closeStaleRun(run.id);
        if (closed) out.push({ runId: run.id, ...closed });
      }
      return out;
    });

    // Belt-and-suspenders: also tell Inngest to cancel the underlying
    // execution via the same cancelOn wiring the manual Cancel button uses
    // (src/inngest/skill.ts), in case it's somehow still alive after a long
    // checkpoint gap. The DB row is already closed regardless of whether
    // this lands — same reasoning as the cancel route not waiting on it.
    if (reaped.length > 0) {
      await step.sendEvent(
        "cancel-stale-runs",
        reaped.map((r) => skillRunCancel.create({ runId: r.runId }))
      );
      await step.sendEvent(
        "notify-stale-runs",
        reaped.map((r) => staleRunNotify.create({ runId: r.runId, engagementId: r.engagementId, skillName: r.skillName }))
      );
    }

    return { reaped: reaped.length };
  }
);

/** Fanned-out handler: the one real network call (Slack/email) per reaped run. */
export const notifyStaleRunCron = inngest.createFunction(
  { id: "notify-stale-run", triggers: [staleRunNotify] },
  async ({ event }) => {
    await notifyRunOutcome(
      event.data.engagementId,
      event.data.runId,
      event.data.skillName,
      "run_timed_out",
      "This run sat in \"running\" longer than its allowed ceiling and was closed automatically. If this keeps happening for the same module, it usually means an upstream API call is hanging — check the run's step timeline for where it stalled."
    );
    return { notified: true };
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

/**
 * Booking-webhook polling fallback (Pin-Down recovery gap 5).
 *
 * Every 5 minutes: cheap DB-only scan for engagements whose
 * stack.webhook_receiver_mode is "polling" and are due for their next
 * cycle per stack.webhook_poll_interval_minutes, then fan out one
 * bookingPollEngagement event per due engagement. The actual "list
 * bookings since timestamp" API call happens in the fanned-out handler
 * below — same split rationale as every other cron in this file: a single
 * tenant's slow/failing booking API call shouldn't block or retry-storm
 * everyone else's poll cycle.
 *
 * 5-minute cadence matches the OG SKILL.md's stated default
 * (webhook_receiver.poll interval) exactly.
 */
export const bookingPollCron = inngest.createFunction(
  { id: "booking-poll-cron", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-engagements-due-for-poll", () => findEngagementsDueForPoll());

    if (due.length > 0) {
      await step.sendEvent(
        "dispatch-booking-polls",
        due.map((engagementId) => bookingPollEngagement.create({ engagementId }))
      );
    }

    return { dispatched: due.length };
  }
);

/** Fanned-out handler: one platform API poll + enrollment pass, one engagement at a time. */
export const processBookingPollEngagementCron = inngest.createFunction(
  { id: "process-booking-poll-engagement", triggers: [bookingPollEngagement] },
  async ({ event }) => {
    return pollBookingsForEngagement(event.data.engagementId);
  }
);

/**
 * HEAD-validated platform docs links (Pin-Down recovery gap 9).
 *
 * The OG SKILL.md fetched canonical public docs URLs for every platform it
 * touched and HEAD-validated them at install time. UTP's adapters
 * (hosting.ts, booking.ts, email.ts) reference fixed platforms with no
 * runtime docs-link check at all, so a platform vendor moving their docs
 * URL silently breaks any troubleshooting screen that links to it. This
 * nightly cron re-validates the canonical set and writes status/last-
 * checked into platform_docs_links so the dashboard can flag staleness
 * inline instead of 404ing when an operator clicks through.
 */
export const docsLinksValidatorCron = inngest.createFunction(
  { id: "docs-links-validator-cron", triggers: [{ cron: "TZ=UTC 0 6 * * *" }] }, // 06:00 UTC daily
  async ({ step }) => {
    return step.run("validate-platform-docs-links", () => validateAllPlatformDocsLinks());
  }
);

/**
 * Dynamic brief trigger (Pre-Call Read recovery gap 1).
 *
 * The OG SKILL.md offered the buyer a choice at Plan: nightly batch, or a
 * "dynamic" trigger firing on booking.upcoming so the rep gets briefed
 * shortly after a call enters the lead-time window rather than waiting
 * for the nightly run. None of the four booking platforms this app
 * integrates with expose a distinct, subscribable "N hours before this
 * specific call" webhook event — what they expose is booking.created and
 * (for some) booking.cancelled. So "dynamic" here is implemented as a
 * tight rolling poll (every 15 minutes) that asks each dynamic-mode
 * engagement "what calls just entered my lead-time window since the last
 * check", rather than a literal webhook subscription — same honest
 * reframing Pin-Down's own polling fallback already applies for booking
 * events lacking a real webhook. In practice this still gets a rep their
 * brief within 15 minutes of entering the window instead of up to 24
 * hours late on the old nightly-only path, which is the actual value the
 * OG SKILL.md's dynamic mode was for.
 *
 * briefedCallsLog's existing callId + 24h dedup window (see
 * brief-service.ts) already makes this idempotent against being polled
 * many times before a call's briefing window closes — no separate
 * watermark bookkeeping needed here, unlike bookingPollCron.
 */
export const dynamicBriefCron = inngest.createFunction(
  { id: "dynamic-brief-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const engagementIds = await step.run("find-dynamic-brief-engagements", async () => {
      const all = await db.select().from(engagements);
      return all
        .filter((t) => {
          const stack = t.stack as any;
          return stack?.brief_trigger_type === "dynamic_webhook" && stack?.booking_platform && stack?.booking_platform_credentials_ref;
        })
        .map((t) => t.engagementId);
    });

    if (engagementIds.length > 0) {
      await step.sendEvent(
        "dispatch-dynamic-briefs",
        engagementIds.map((engagementId) => dynamicBriefEngagement.create({ engagementId }))
      );
    }

    return { dispatched: engagementIds.length };
  }
);

/** Fanned-out handler: one engagement's dynamic-window brief pass. */
export const processDynamicBriefEngagementCron = inngest.createFunction(
  { id: "process-dynamic-brief-engagement", triggers: [dynamicBriefEngagement] },
  async ({ event, step }) => {
    const { engagementId } = event.data;

    const tenantRaw = await step.run("load-tenant", async () => {
      const [row] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      return row ?? null;
    });
    if (!tenantRaw) return { briefed: 0, reason: "engagement not found" };

    const tenant = { ...tenantRaw, createdAt: new Date(tenantRaw.createdAt), updatedAt: new Date(tenantRaw.updatedAt) };

    const runId = crypto.randomUUID();
    await startRun({
      id: runId,
      engagementId,
      skillName: "pre-call-read",
      phase: "roster_fetch",
      label: "Dynamic brief trigger (Inngest)",
    });

    try {
      const briefed = await executeNightlyBriefingCycle(tenant, runId, step, "dynamic_webhook");
      return { briefed };
    } catch (err: any) {
      await failRun(runId, err).catch(() => {});
      throw err;
    }
  }
);