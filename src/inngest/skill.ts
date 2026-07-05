import { inngest, skillRunExecute, skillRunCancel } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";
import { generateRecoveryCadence } from "@/features/win-back/server/recovery-service";
import { runPinDownOnboarding } from "@/features/pin-down/server/onboarding-service";
import { failRun } from "@/lib/run-log";

/**
 * Unified Background Skill Execution Worker
 * Decoupled from incoming client request thresholds to prevent gateway timeouts.
 *
 * v4 API: triggers live in the options object (1st arg), not a separate
 * positional arg. `skillRunExecute` (eventType()) gives `event` a real type
 * instead of falling back to implicit `any`.
 */
export const executeSkillRun = inngest.createFunction(
  {
    id: "execute-skill-run",
    retries: 1,
    triggers: [skillRunExecute],
    // Matches on data.runId between the triggering event and any later
    // skill/run.cancel event. This stops Inngest from scheduling this run's
    // *next* step — it can't interrupt a step.run() callback already
    // mid-execution. That's why the DB write happens immediately in the
    // cancel route below, instead of waiting on this to take effect.
    cancelOn: [{ event: skillRunCancel, match: "data.runId" }],
  },
  async ({ event, step }) => {
    const { runId, engagementId, skillName, auditType } = event.data;

    // Re-fetch the tenant row inside the worker rather than trusting the
    // event payload. The old version serialized the FULL engagement row
    // (including stack.slack_webhook_url and stack.webhook_signing_secret
    // in plaintext) into the Inngest event, which Inngest Cloud stores —
    // unnecessary secret exposure to a third party. This also means the
    // worker always sees current tenant config, not a stale snapshot from
    // whenever the event was enqueued.
    const tenantRaw = await step.run("load-tenant", async () => {
      const [row] = await db
        .select()
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1);
      if (!row) throw new Error(`Engagement not found: ${engagementId}`);
      return row;
    });

    // engagements.createdAt/updatedAt are `timestamp` columns (real Date
    // objects from Drizzle), but they just crossed a step.run() boundary,
    // which Inngest JSON-serializes by default. On a fresh execution
    // they're still Dates; on any checkpoint-resumed replay they come
    // back as ISO strings. Nothing downstream currently reads these two
    // fields as Dates, so this isn't live-broken today — but it's the
    // same class of bug the roster callTime fix in brief-service.ts
    // addresses, and leaving it unnormalized means the next person who
    // adds `tenant.createdAt.getTime()` to a report or filter gets a
    // runtime-only failure that only reproduces on a replayed step.
    // Closing it here once instead of leaving it as a landmine.
    const tenant = {
      ...tenantRaw,
      createdAt: new Date(tenantRaw.createdAt),
      updatedAt: new Date(tenantRaw.updatedAt),
    };

    try {
      if (skillName === "pin-down") {
        await runPinDownOnboarding(tenant, runId, step);
      }

      if (skillName === "pre-call-read") {
        await executeNightlyBriefingCycle(tenant, runId, step);
      }

      if (skillName === "leak-map") {
        const engine = new AuditEngine();
        await engine.runAuditPipeline(engagementId, auditType ?? "weekly", runId, step);
      }

      if (skillName === "win-back") {
        await generateRecoveryCadence(tenant, runId, step);
      }
    } catch (err: any) {
      // Safety net only — brief-service.ts and audit-engine.ts already call
      // failRun() internally before rethrowing, so this mainly covers
      // errors thrown by load-tenant or anything outside their own
      // try/catch. Calling failRun() twice on the same runId is harmless
      // (idempotent overwrite), not duplicated work.
      await failRun(runId, err).catch(() => {});
      throw err; // Let Inngest's retry policy decide whether to re-invoke.
    }
  }
);