import type { GetStepTools, Inngest } from "inngest";
import { runRepOnboarding } from "@/features/reputation-manager/server/onboarding-service";
import { runRepEnginePanel } from "@/features/reputation-manager/server/engine-panel-service";
import {
  REP_SKILL_IDS,
  REP_SKILL_MANIFEST,
  isRepSkillId,
  type RepSkillId,
  type RepSkillManifestEntry,
} from "@/lib/rep-skill-manifest";

export { REP_SKILL_IDS, isRepSkillId };
export type { RepSkillId };

type StepTools = GetStepTools<Inngest.Any>;

export interface RepSkillDefinition extends RepSkillManifestEntry {
  /** Server-only — same reasoning as SkillDefinition.execute in
   * skill-registry.ts: this file pulls in db access and onboarding-
   * service.ts's own imports, so it stays out of rep-skill-manifest.ts to
   * keep that file safe for client components. */
  execute?: (tenant: any, runId: string, step: StepTools | undefined) => Promise<void>;
}

export const REP_SKILL_REGISTRY: Record<RepSkillId, RepSkillDefinition> = {
  "rep-onboarding": {
    ...REP_SKILL_MANIFEST["rep-onboarding"],
    execute: (tenant, runId, step) => runRepOnboarding(tenant, runId, step),
  },
  "rep-engine-panel": {
    ...REP_SKILL_MANIFEST["rep-engine-panel"],
    execute: (tenant, runId, step) => runRepEnginePanel(tenant, runId, step),
  },
};
