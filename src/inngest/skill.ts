import { inngest, skillRunExecute, skillRunCancel } from "@/lib/inngest";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { failRun, logStep, finishRun } from "@/lib/run-log";
import { SKILL_REGISTRY, isSkillId, type SkillDefinition } from "@/lib/skill-registry";
import { REP_SKILL_REGISTRY, isRepSkillId, type RepSkillDefinition } from "@/lib/rep-skill-registry";
import { CHAT_SKILL_REGISTRY, isChatSkillId, type ChatSkillDefinition } from "@/lib/chat-skill-registry";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isEngagementPaused } from "@/lib/engagement-status"; // <--- ADDED

/**
 * Resolves a skill id against every product's catalog in turn. Showtime's
 * SKILL_REGISTRY, Reputation Manager's REP_SKILL_REGISTRY, and Teammates
 * chat's own CHAT_SKILL_REGISTRY are deliberately separate modules (see
 * rep-skill-manifest.ts's file comment for why) — this dispatcher is the
 * one place that legitimately needs to know all three exist, everything
 * downstream (the run itself, engagementSkills, skillRuns) already treats
 * skillId as an opaque, product-agnostic string.
 *
 * A real third catalog landing (chat-skill-manifest.ts, 2026-09-01) is
 * exactly the trigger this function's own prior comment named for folding
 * a sequential if-chain into a loop over a registered list — done now,
 * not before, same "generalize once a real second (now third) example
 * exists" reasoning this app applies everywhere else. A fourth catalog
 * costs one array entry, not another branch.
 */
const SKILL_CATALOGS: { isId: (v: string) => boolean; registry: Record<string, SkillDefinition | RepSkillDefinition | ChatSkillDefinition> }[] = [
  { isId: isSkillId, registry: SKILL_REGISTRY },
  { isId: isRepSkillId, registry: REP_SKILL_REGISTRY },
  { isId: isChatSkillId, registry: CHAT_SKILL_REGISTRY },
];

function resolveSkillDefinition(skillName: string): SkillDefinition | RepSkillDefinition | ChatSkillDefinition | null {
  for (const { isId, registry } of SKILL_CATALOGS) {
    if (isId(skillName)) return registry[skillName];
  }
  return null;
}

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
    const { runId, engagementId, skillName, auditType, manualOverride, voiceExtractionDomain, pageAuditUrl } = event.data;

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
      await finishRun(runId, { status: "skipped" });
      return;
    }

    try {
      const definition = resolveSkillDefinition(skillName);
      if (!definition) {
        throw new Error(`Unknown skill: ${skillName}`);
      }

      const enabled = await step.run("check-skill-enabled", () =>
        isSkillEnabledForEngagement(engagementId, skillName)
      );

      if (!enabled) {
        await logStep(runId, {
          phase: "skill_disabled",
          status: "skipped",
          detail: `${definition.name} is turned off for this engagement — nothing ran.`,
        });
        await finishRun(runId, { status: "skipped" });
        return;
      }

      if (!definition.execute) {
        throw new Error(`${definition.name} has no direct executor — it only runs from its own event handlers.`);
      }

      await definition.execute(tenant, runId, step, { auditType, voiceExtractionDomain, pageAuditUrl });
    } catch (err: unknown) {
      await failRun(runId, err).catch(() => {});
      throw err;
    }
  }
);