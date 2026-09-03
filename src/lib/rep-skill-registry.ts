import type { GetStepTools, Inngest } from "inngest";
import { runRepOnboarding } from "@/features/reputation-manager/server/onboarding-service";
import { runRepEnginePanel } from "@/features/reputation-manager/server/engine-panel-service";
import { runRepTrustpilotWatch } from "@/features/reputation-manager/server/trustpilot-watch-service";
import { runRepRedditWatch } from "@/features/reputation-manager/server/reddit-watch-service";
import { runRepCrisisResponse } from "@/features/reputation-manager/server/crisis-response-service";
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
   * keep that file safe for client components. Takes an optional 4th ctx
   * param, unused by either of Reputation Manager's own two skills today,
   * for parity with SkillDefinition/ChatSkillDefinition's signatures —
   * skill.ts's dispatcher calls .execute uniformly across all three
   * catalogs' definitions, so all three need to accept the same call
   * shape even where a given skill has nothing to read from it. */
  execute?: (tenant: any, runId: string, step: StepTools | undefined, ctx?: { auditType?: "weekly" | "monthly"; voiceExtractionDomain?: string }) => Promise<void>;
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
  "rep-trustpilot-watch": {
    ...REP_SKILL_MANIFEST["rep-trustpilot-watch"],
    execute: (tenant, runId, step) => runRepTrustpilotWatch(tenant, runId, step),
  },
  "rep-reddit-watch": {
    ...REP_SKILL_MANIFEST["rep-reddit-watch"],
    execute: (tenant, runId, step) => runRepRedditWatch(tenant, runId, step),
  },
  "rep-crisis-response": {
    ...REP_SKILL_MANIFEST["rep-crisis-response"],
    execute: (tenant, runId, step) => runRepCrisisResponse(tenant, runId, step),
  },
};