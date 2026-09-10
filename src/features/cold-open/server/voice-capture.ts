// src/features/cold-open/server/voice-capture.ts
//
// Voice Capture: sets the greeting/sign-off/tone Daily Send writes in,
// plus the subject and body variant pools copy-engine.ts rotates through.
// Save path validates via subject-variants.ts/body-variants.ts (blocking
// only on "error"-severity violations — "warn" ones are surfaced but
// allowed, same severity contract the source pack's validate_subject_pool
// documents).

import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState } from "./config";
import { validateSubjectPool, poolHasErrors, type SubjectPoolViolation } from "./subject-variants";
import { validateBodyVariants, type BodyTouchset } from "./body-variants";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export type VoiceCaptureInput = {
  greeting: string;
  signOff: string;
  tone: string;
  sourceDomain?: string;
  subjectVariants: string[];
  bodyVariantPools: Record<string, BodyTouchset[]>;
};

export interface VoiceCaptureValidation {
  subjectViolations: SubjectPoolViolation[];
  bodyProblems: string[];
}

export async function validateVoiceCapture(engagementId: string, input: VoiceCaptureInput): Promise<VoiceCaptureValidation> {
  const config = await getColdOpenConfig(engagementId);
  const icpSlugs = (config?.icps ?? []).map((i) => i.slug);
  return {
    subjectViolations: validateSubjectPool(input.subjectVariants ?? []),
    bodyProblems: validateBodyVariants(input.bodyVariantPools ?? {}, icpSlugs),
  };
}

export async function saveVoiceCapture(engagementId: string, input: VoiceCaptureInput): Promise<{ ok: true; warnings: string[] } | { error: string }> {
  if (!input.greeting?.trim() || !input.signOff?.trim() || !input.tone?.trim()) {
    return { error: "Greeting, sign-off, and tone are all required." };
  }

  const validation = await validateVoiceCapture(engagementId, input);
  if (poolHasErrors(validation.subjectViolations)) {
    return { error: "Subject pool failed validation:\n- " + validation.subjectViolations.filter((v) => v.severity === "error").map((v) => v.message).join("\n- ") };
  }
  // Body-variant gaps are advisory here (they only block Daily Send in
  // upload copy mode, and only once an ICP is actually configured) —
  // surfaced as warnings rather than blocking the save.
  const warnings = [
    ...validation.subjectViolations.filter((v) => v.severity === "warn").map((v) => v.message),
    ...validation.bodyProblems,
  ];

  await upsertColdOpenConfig(engagementId, {
    voiceProfile: { greeting: input.greeting.trim(), signOff: input.signOff.trim(), tone: input.tone.trim(), sourceDomain: input.sourceDomain?.trim() || undefined },
    subjectVariants: input.subjectVariants ?? [],
    bodyVariantPools: input.bodyVariantPools ?? {},
  });
  await setColdOpenPhaseState(engagementId, "voice_capture", "complete");

  return { ok: true, warnings };
}

export async function runVoiceCapture(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));
    if (!config?.voiceProfile) {
      throw new Error("No voice profile found for this engagement — save the Voice Capture form before this skill can run.");
    }

    const icpSlugs = config.icps.map((i) => i.slug);
    const subjectViolations = validateSubjectPool(config.subjectVariants);
    const bodyProblems = validateBodyVariants(config.bodyVariantPools, icpSlugs);

    summary.whatWasAttempted.push("Re-validated the saved voice profile, subject pool, and body variant pools.");

    if (poolHasErrors(subjectViolations)) {
      const detail = subjectViolations.filter((v) => v.severity === "error").map((v) => v.message).join("; ");
      await logStep(runId, { phase: "voice_validate", status: "failed", detail });
      summary.whatFailed.push(`Subject pool has hard errors: ${detail}`);
    } else {
      await logStep(runId, { phase: "voice_validate", status: "success", detail: `Voice profile clean. ${config.subjectVariants.length} subject variant(s), ${bodyProblems.length} ICP(s) below the minimum body-variant count.` });
      summary.whatWorked.push(`Voice profile is set (${config.voiceProfile.tone} tone). ${config.subjectVariants.length} subject variant(s) on file.`);
      if (bodyProblems.length > 0) {
        summary.openItems.push(...bodyProblems);
      }
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
