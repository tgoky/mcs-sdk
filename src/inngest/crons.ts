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
import { inngest, skillRunExecute } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { startRun } from "@/lib/run-log";
import { evaluateActiveAlertMonitor } from "@/features/leak-map/server/alert-monitor";

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