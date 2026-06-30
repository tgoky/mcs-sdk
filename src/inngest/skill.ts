import { inngest } from "@/lib/inngest";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";
import { failRun } from "@/lib/run-log";

/**
 * Unified Background Skill Execution Worker
 * Decoupled from incoming client request thresholds to prevent gateway timeouts.
 */
export const executeSkillRun = inngest.createFunction(
  { id: "execute-skill-run", retries: 1 },
  { event: "skill/run.execute" },
  async ({ event, step }) => {
    const { runId, tenant, engagementId, skillName, auditType } = event.data;

    try {
      // Wrapping the logic paths in a single step guarantees sequential logStep()
      // timeline entries, strictly respecting the database write constraints.
      await step.run("execute-skill", async () => {
        if (skillName === "pre-call-read") {
          await executeNightlyBriefingCycle(tenant, runId);
        }

        if (skillName === "leak-map") {
          const engine = new AuditEngine();
          await engine.runAuditPipeline(engagementId, auditType ?? "weekly", runId);
        }
      });
    } catch (err: any) {
      // Safety net: Only updates error messages and terminal flags.
      // Omit custom summary fields here to prevent blanking out rich internal service telemetry.
      await failRun(runId, err).catch(() => {});
      throw err; // Allow Inngest engine monitoring tools to handle retry policies
    }
  }
);