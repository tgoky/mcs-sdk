import crypto from "crypto";
import { startRun, logStep, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";

/**
 * Seeds a run row and dispatches a bridge's execute via Inngest — the
 * shared "fire this bridge right now" primitive.
 *
 * Only used for bridges that run once, immediately, when turned on
 * (a manifest entry with runOnSetup: true — Pin-Down and Reputation
 * Manager's rep-onboarding, as of this bridge). Bridges that only run
 * off their own trigger (webhook, cron, the outcome sweep) never call
 * this; they're just enabled/disabled and wait.
 *
 * Extracted from the old /api/pin-down/launch route so the generic
 * per-bridge enable route (/api/engagements/[id]/skills/[skillId]) can
 * fire the same dispatch the moment a runOnSetup bridge is switched on,
 * instead of "launching a client" being hardcoded to always fire one
 * specific bridge.
 *
 * skillName widened from SkillId to string, matching
 * SkillRunExecuteData.skillName's own widening — this function's body
 * never actually branched on which skill it was, so the type was
 * narrower than the implementation needed.
 */
export async function dispatchSkillRun(
  engagementId: string,
  skillName: string,
  label: string,
  options?: {
    phase?: string;
    /** Steps to log as already-complete before the run actually starts —
     * e.g. Pin-Down backfilling "credentials were already stored during
     * setup" so its run timeline reads as continuous instead of jumping
     * straight to voice_scrape. Optional and empty by default: most
     * runOnSetup bridges (rep-onboarding included) have no prior step
     * worth backfilling, so forcing a Pin-Down-flavored step onto every
     * caller was the wrong default once a second bridge existed. */
    completedSteps?: { phase: string; detail: string }[];
  }
): Promise<string> {
  const runId = crypto.randomUUID();
  try {
    await startRun({ id: runId, engagementId, skillName, phase: options?.phase ?? "onboarding_start", label });

    for (const step of options?.completedSteps ?? []) {
      await logStep(runId, { phase: step.phase, status: "success", detail: step.detail });
    }

    await inngest.send(skillRunExecute.create({ runId, engagementId, skillName }));
    return runId;
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}
