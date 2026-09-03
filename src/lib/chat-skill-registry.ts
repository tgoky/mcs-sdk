import type { GetStepTools, Inngest } from "inngest";
import { runVoiceExtractionOnly } from "@/features/pin-down/server/voice-extraction-only";
import { runScriptPackOnly } from "@/features/pin-down/server/script-pack-only";
import { runAdCreativeBriefsOnly } from "@/features/pin-down/server/ad-briefs-only";
import { runPageAuditOnly } from "@/features/pin-down/server/page-audit-only";
import { CHAT_SKILL_IDS, CHAT_SKILL_MANIFEST, isChatSkillId, type ChatSkillId, type ChatSkillManifestEntry } from "@/lib/chat-skill-manifest";

export { CHAT_SKILL_IDS, isChatSkillId };
export type { ChatSkillId };

type StepTools = GetStepTools<Inngest.Any>;

/** Union of every per-invocation extra any chat skill's executor might need — same
 * "shared context shape covers every catalog member's needs, even ones that ignore
 * most of it" pattern SkillRunContext (skill-registry.ts) already established for
 * auditType. */
export interface ChatSkillContext {
  voiceExtractionDomain?: string;
  pageAuditUrl?: string;
}

export interface ChatSkillDefinition extends ChatSkillManifestEntry {
  /** Server-only — same reasoning as SkillDefinition.execute (skill-registry.ts) and
   * RepSkillDefinition.execute (rep-skill-registry.ts): pulls in db access and each
   * *-only.ts file's own imports, kept out of chat-skill-manifest.ts.
   * tenant: any, matching both of those exactly — this is the raw re-fetched
   * engagement row, whose full shape isn't worth modeling at this layer. */
  execute: (tenant: any, runId: string, step: StepTools | undefined, ctx?: ChatSkillContext) => Promise<void>;
}

export const CHAT_SKILL_REGISTRY: Record<ChatSkillId, ChatSkillDefinition> = {
  "pin-down-voice": {
    ...CHAT_SKILL_MANIFEST["pin-down-voice"],
    execute: (tenant, runId, step, ctx) => runVoiceExtractionOnly(tenant, runId, step, ctx),
  },
  "pin-down-scripts": {
    ...CHAT_SKILL_MANIFEST["pin-down-scripts"],
    execute: (tenant, runId, step) => runScriptPackOnly(tenant, runId, step),
  },
  "pin-down-ad-briefs": {
    ...CHAT_SKILL_MANIFEST["pin-down-ad-briefs"],
    execute: (tenant, runId, step) => runAdCreativeBriefsOnly(tenant, runId, step),
  },
  "pin-down-page-audit": {
    ...CHAT_SKILL_MANIFEST["pin-down-page-audit"],
    execute: (tenant, runId, step, ctx) => runPageAuditOnly(tenant, runId, step, ctx),
  },
};
