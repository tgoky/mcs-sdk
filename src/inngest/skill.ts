import { inngest, skillRunExecute, skillRunCancel } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { failRun, logStep, finishRun } from "@/lib/run-log";
import { SKILL_REGISTRY, isSkillId } from "@/lib/skill-registry";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isEngagementPaused } from "@/lib/engagement-status"; // <--- ADDED

/**
 * Unified Background Skill Execution Worker
 * Decoupled from incoming client request thresholds to prevent gateway timeouts.
 */
export const executeSkillRun = inngest.createFunction(
  {
    id: "execute-skill-run",
    retries: 1,
    triggers: [skillRunExecute],
    cancelOn: [{ event: skillRunCancel, match: "data.runId" }],
    concurrency: {
      key: "event.data.engagementId",
      limit: 1,
    },
  },
  async ({ event, step }) => {
    const { runId, engagementId, skillName, auditType, manualOverride } = event.data; // <--- ADDED manualOverride

    const tenantRaw = await step.run("load-tenant", async () => {
      const [row] = await db
        .select()
        .from(engagements)
        .where(eq(engagements.engagementId, engagementId))
        .limit(1);
      if (!row) throw new Error(`Engagement not found: ${engagementId}`);
      return row;
    });

    const tenant = {
      ...tenantRaw,
      createdAt: new Date(tenantRaw.createdAt),
      updatedAt: new Date(tenantRaw.updatedAt),
    };

    // ── 🛡️ CENTRAL PAUSE & SOFT-DELETE CHOKEPOINT ─────────────────────
    // Hard-blocks any automated/scheduled run if engagement is paused or deleted.
    // Explicit manual triggers (`manualOverride: true`) are allowed through.
    if ((tenant.deletedAt || isEngagementPaused(tenant)) && !manualOverride) {
      const skipReason = tenant.deletedAt
        ? "Engagement is deleted"
        : tenant.pausedReason
        ? `Engagement is paused (${tenant.pausedReason})`
        : "Engagement is paused";

      await logStep(runId, {
        phase: "skill_disabled",
        status: "skipped",
        detail: `${skipReason} — run skipped.`,
      });
      await finishRun(runId);
      return;
    }

    try {
      if (!isSkillId(skillName)) {
        throw new Error(`Unknown skill: ${skillName}`);
      }

      const definition = SKILL_REGISTRY[skillName];

      const enabled = await step.run("check-skill-enabled", () =>
        isSkillEnabledForEngagement(engagementId, skillName)
      );

      if (!enabled) {
        await logStep(runId, {
          phase: "skill_disabled",
          status: "skipped",
          detail: `${definition.name} is turned off for this engagement — nothing ran.`,
        });
        await finishRun(runId);
        return;
      }

      if (!definition.execute) {
        throw new Error(`${definition.name} has no direct executor — it only runs from its own event handlers.`);
      }

      await definition.execute(tenant, runId, step, { auditType });
    } catch (err: unknown) {
      await failRun(runId, err).catch(() => {});
      throw err;
    }
  }
);