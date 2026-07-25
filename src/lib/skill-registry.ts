import type { GetStepTools, Inngest } from "inngest";
import { runPinDownOnboarding } from "@/features/pin-down/server/onboarding-service";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";
import { generateRecoveryCadence } from "@/features/win-back/server/recovery-service";

type StepTools = GetStepTools<Inngest.Any>;

export type SkillId = "pin-down" | "pile-on" | "pre-call-read" | "win-back" | "leak-map";

export const SKILL_IDS: SkillId[] = ["pin-down", "pile-on", "pre-call-read", "win-back", "leak-map"];

/** Extra per-invocation params a skill's executor might need beyond (tenant, runId, step). */
export interface SkillRunContext {
  auditType?: "weekly" | "monthly";
}

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  /**
   * True for the one skill that a freshly-saved engagement should launch
   * automatically on its first run — see /api/pin-down/launch, which
   * loops over getSkillsRunOnSetup() instead of hardcoding "pin-down" so
   * a future agent with a different (or no) setup-time skill doesn't
   * mean touching that route.
   */
  runOnSetup: boolean;
  /**
   * Present only for skills dispatched through the generic
   * skill/run.execute event (src/inngest/skill.ts). pile-on has none —
   * it runs entirely from its own webhook-triggered Inngest functions
   * (see src/features/pile-on/server), never from this dispatcher.
   */
  execute?: (tenant: any, runId: string, step: StepTools | undefined, ctx?: SkillRunContext) => Promise<void>;
}

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  "pin-down": {
    id: "pin-down",
    name: "Pin-Down",
    description:
      "Onboards a new client: learns their brand voice, drafts ad creative briefs, video scripts, and a confirmation page, and wires up their booking webhook.",
    runOnSetup: true,
    execute: (tenant, runId, step) => runPinDownOnboarding(tenant, runId, step),
  },
  "pile-on": {
    id: "pile-on",
    name: "Pile-On",
    description: "Enrolls booked prospects into pre-call and win-back sequences as bookings come in via webhook.",
    runOnSetup: false,
    // No execute — see the doc comment on SkillDefinition.execute above.
  },
  "pre-call-read": {
    id: "pre-call-read",
    name: "Pre-Call Read",
    description: "Nightly briefing cycle: researches tomorrow's booked calls and delivers a brief before each one.",
    runOnSetup: false,
    execute: async (tenant, runId, step) => {
      await executeNightlyBriefingCycle(tenant, runId, step);
    },
  },
  "win-back": {
    id: "win-back",
    name: "Win-Back",
    description: "Generates and manages a re-engagement cadence for prospects who went cold.",
    runOnSetup: false,
    execute: (tenant, runId, step) => generateRecoveryCadence(tenant, runId, step),
  },
  "leak-map": {
    id: "leak-map",
    name: "Leak-Map",
    description: "Audits the funnel for drop-off points and produces a report.",
    runOnSetup: false,
    execute: async (tenant, runId, step, ctx) => {
      const engine = new AuditEngine();
      await engine.runAuditPipeline(tenant.engagementId, ctx?.auditType ?? "weekly", runId, step);
    },
  },
};

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as string[]).includes(value);
}

/** Skills a freshly-saved engagement should launch automatically once — see /api/pin-down/launch. */
export function getSkillsRunOnSetup(): SkillId[] {
  return SKILL_IDS.filter((id) => SKILL_REGISTRY[id].runOnSetup);
}
