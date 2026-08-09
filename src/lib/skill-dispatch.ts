import crypto from "crypto";
import { startRun, logStep, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import type { SkillId } from "@/lib/skill-manifest";

/**
 * Seeds a run row and dispatches a bridge's execute via Inngest — the
 * shared "fire this bridge right now" primitive.
 *
 * Only used for bridges that run once, immediately, when turned on
 * (SKILL_MANIFEST[id].runOnSetup — today that's Pin-Down alone). Bridges
 * that only run off their own trigger (webhook, cron, the outcome
 * sweep) never call this; they're just enabled/disabled and wait.
 *
 * Extracted from the old /api/pin-down/launch route so the generic
 * per-bridge enable route (/api/engagements/[id]/skills/[skillId]) can
 * fire the same dispatch the moment a runOnSetup bridge is switched on,
 * instead of "launching a client" being hardcoded to always fire one
 * specific bridge.
 *
 * phase: "onboarding_start" and the credential_storage step below are
 * Pin-Down-flavored — worth generalizing once a second runOnSetup bridge
 * exists and this needs to describe something other than onboarding.
 */
export async function dispatchSkillRun(
  engagementId: string,
  skillName: SkillId,
  label: string
): Promise<string> {
  const runId = crypto.randomUUID();
  try {
    await startRun({ id: runId, engagementId, skillName, phase: "onboarding_start", label });

    // Credentials were already stored during setup — log it here as an
    // already-complete step so the run timeline still reads as a full,
    // continuous sequence rather than jumping straight to voice_scrape.
    await logStep(runId, {
      phase: "credential_storage",
      status: "success",
      detail: "Credentials stored during setup",
    });

    await inngest.send(skillRunExecute.create({ runId, engagementId, skillName }));
    return runId;
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}
