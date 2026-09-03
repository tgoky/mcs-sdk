// src/features/pin-down/server/script-pack-only.ts
//
// Teammates chat's "generate hero + breakout video scripts" action —
// pin-down-scripts in chat-skill-registry.ts. Reuses buildScriptPack
// exactly as onboarding-service.ts calls it, standalone rather than as
// one step in the full wizard flow. Only `buyer` is hard-required by
// ScriptBuilderInput — everything else (brandVoiceProfile, offerDetails,
// topCallQuestions, existingProof, castingChoice) is optional there and
// read straight off whatever's already on the engagement row (the same
// full row executeSkillRun already loads, see skill.ts) — a bare
// create_client client still produces a script pack, just a more
// generic one than a fully onboarded client would, same graceful-
// degradation buildScriptPack already has built in, not something this
// file adds.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { buildScriptPack, type CastingChoice } from "./script-builder";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runScriptPackOnly(
  tenant: {
    engagementId: string;
    buyer: string;
    brandVoiceProfile?: unknown;
    offerDetails?: { name: string; price: string; icp: string; traffic_temperature: "cold" | "warm" | "hot" } | null;
    topCallQuestions?: string[] | null;
    prospectMeets?: string | null;
    existingProof?: { testimonials: Array<{ name: string; role: string; company?: string; quote: string }> } | null;
    castingChoice?: CastingChoice | null;
  },
  runId: string,
  step: StepTools | undefined
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    await logStep(runId, { phase: "script_pack", status: "running" });
    const scriptPack = await run("script-pack", () =>
      buildScriptPack(
        {
          buyer: tenant.buyer,
          brandVoiceProfile: tenant.brandVoiceProfile,
          offerDetails: tenant.offerDetails ?? undefined,
          topCallQuestions: tenant.topCallQuestions ?? undefined,
          prospectMeets: tenant.prospectMeets ?? undefined,
          existingProof: tenant.existingProof ?? undefined,
          castingChoice: tenant.castingChoice ?? undefined,
        },
        runId
      )
    );

    await run("persist", async () => {
      await db
        .update(engagements)
        .set({
          pinDownScriptPack: {
            generatedAt: new Date().toISOString(),
            heroScript: scriptPack.heroScript,
            breakoutScripts: scriptPack.breakoutScripts,
            recordingChecklist: scriptPack.recordingChecklist,
          },
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, tenant.engagementId));
    });

    await logStep(runId, { phase: "script_pack", status: "success", detail: `Hero + ${scriptPack.breakoutScripts.length} breakout scripts generated` });
    summary.whatWasAttempted.push(`Generated a hero video script (${scriptPack.heroScript.chapters.length} chapters) and ${scriptPack.breakoutScripts.length} breakout scripts for ${tenant.buyer}.`);
    await finishRun(runId, { summary });
  } catch (err) {
    await logStep(runId, { phase: "script_pack", status: "failed", detail: err instanceof Error ? err.message : String(err) });
    await failRun(runId, err);
  }
}
