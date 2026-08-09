import type { GetStepTools, Inngest } from "inngest";
import { runPinDownOnboarding } from "@/features/pin-down/server/onboarding-service";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";
import { generateRecoveryCadence } from "@/features/win-back/server/recovery-service";
import { SKILL_IDS, SKILL_MANIFEST, isSkillId, type SkillId, type SkillManifestEntry } from "@/lib/skill-manifest";

export { SKILL_IDS, isSkillId };
export type { SkillId };

type StepTools = GetStepTools<Inngest.Any>;

/** Extra per-invocation params a skill's executor might need beyond (tenant, runId, step). */
export interface SkillRunContext {
  auditType?: "weekly" | "monthly";
}

export interface SkillDefinition extends SkillManifestEntry {
  /**
   * Present only for skills dispatched through the generic
   * skill/run.execute event (src/inngest/skill.ts). pile-on has none —
   * it runs entirely from its own webhook- and poll-triggered Inngest
   * functions (see src/inngest/booking-webhook.ts and
   * src/features/pin-down/server/booking-poller.ts), never from this
   * dispatcher.
   *
   * Server-only — this is exactly why SKILL_MANIFEST in skill-manifest.ts
   * exists separately: nothing in this file is safe to import from a
   * "use client" component, since these closures pull in db access and
   * every service module's own imports.
   */
  execute?: (tenant: any, runId: string, step: StepTools | undefined, ctx?: SkillRunContext) => Promise<void>;
}

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  "pin-down": {
    ...SKILL_MANIFEST["pin-down"],
    execute: (tenant, runId, step) => runPinDownOnboarding(tenant, runId, step),
  },
  "pile-on": {
    ...SKILL_MANIFEST["pile-on"],
    // No execute — see the doc comment on SkillDefinition.execute above.
  },
  "pre-call-read": {
    ...SKILL_MANIFEST["pre-call-read"],
    execute: async (tenant, runId, step) => {
      await executeNightlyBriefingCycle(tenant, runId, step);
    },
  },
  "win-back": {
    ...SKILL_MANIFEST["win-back"],
    execute: (tenant, runId, step) => generateRecoveryCadence(tenant, runId, step),
  },
  "leak-map": {
    ...SKILL_MANIFEST["leak-map"],
    execute: async (tenant, runId, step, ctx) => {
      const engine = new AuditEngine();
      await engine.runAuditPipeline(tenant.engagementId, ctx?.auditType ?? "weekly", runId, step);
    },
  },
};

/**
 * Bridges that fire immediately, once, the moment they're turned on for
 * an engagement (via POST /api/engagements/[id]/skills/[skillId] —
 * see dispatchSkillRun in skill-dispatch.ts) rather than waiting on a
 * webhook or cron like the rest. Today that's Pin-Down alone. No longer
 * used to auto-fire anything at client launch — launching a client and
 * turning a bridge on are separate, deliberate actions.
 */
export function getSkillsRunOnSetup(): SkillId[] {
  return SKILL_IDS.filter((id) => SKILL_REGISTRY[id].runOnSetup);
}
