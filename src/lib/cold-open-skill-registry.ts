import type { GetStepTools, Inngest } from "inngest";
import { runIcpLock } from "@/features/cold-open/server/icp-lock";
import { runVoiceCapture } from "@/features/cold-open/server/voice-capture";
import { runSourceConnect } from "@/features/cold-open/server/source-connect";
import { runSendConnect } from "@/features/cold-open/server/send-connect";
import { runDailySend } from "@/features/cold-open/server/daily-send";
import { runReplySort } from "@/features/cold-open/server/reply-sort";
import { runSendReport } from "@/features/cold-open/server/send-report";
import {
  COLD_OPEN_SKILL_IDS,
  COLD_OPEN_SKILL_MANIFEST,
  isColdOpenSkillId,
  type ColdOpenSkillId,
  type ColdOpenSkillManifestEntry,
} from "@/lib/cold-open-skill-manifest";

export { COLD_OPEN_SKILL_IDS, isColdOpenSkillId };
export type { ColdOpenSkillId };

type StepTools = GetStepTools<Inngest.Any>;

export interface ColdOpenSkillDefinition extends ColdOpenSkillManifestEntry {
  /** Server-only — same reasoning as SkillDefinition.execute
   * (skill-registry.ts): this is exactly why COLD_OPEN_SKILL_MANIFEST
   * exists separately, so a "use client" component can import names/
   * descriptions without pulling db access and every feature module's
   * own imports into the browser bundle.
   *
   * Takes the same 4-argument shape every other product's execute does
   * (skill.ts's dispatcher calls whichever catalog's definition with one
   * shared ctx object, sight-unseen of which product it belongs to) even
   * though no Cold Open skill reads ctx today — same "declared for the
   * uniform call site, not because this catalog needs it" reasoning
   * SkillRunContext's own fields carry for Showtime. */
  execute?: (tenant: any, runId: string, step: StepTools | undefined, ctx?: unknown) => Promise<void>;
}

export const COLD_OPEN_SKILL_REGISTRY: Record<ColdOpenSkillId, ColdOpenSkillDefinition> = {
  "icp-lock": {
    ...COLD_OPEN_SKILL_MANIFEST["icp-lock"],
    execute: (tenant, runId, step) => runIcpLock(tenant, runId, step),
  },
  "voice-capture": {
    ...COLD_OPEN_SKILL_MANIFEST["voice-capture"],
    execute: (tenant, runId, step) => runVoiceCapture(tenant, runId, step),
  },
  "source-connect": {
    ...COLD_OPEN_SKILL_MANIFEST["source-connect"],
    execute: (tenant, runId, step) => runSourceConnect(tenant, runId, step),
  },
  "send-connect": {
    ...COLD_OPEN_SKILL_MANIFEST["send-connect"],
    execute: (tenant, runId, step) => runSendConnect(tenant, runId, step),
  },
  "daily-send": {
    ...COLD_OPEN_SKILL_MANIFEST["daily-send"],
    execute: (tenant, runId, step) => runDailySend(tenant, runId, step),
  },
  "reply-sort": {
    ...COLD_OPEN_SKILL_MANIFEST["reply-sort"],
    execute: (tenant, runId, step) => runReplySort(tenant, runId, step),
  },
  "send-report": {
    ...COLD_OPEN_SKILL_MANIFEST["send-report"],
    execute: (tenant, runId, step) => runSendReport(tenant, runId, step),
  },
};
