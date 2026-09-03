// src/features/pin-down/server/ad-briefs-only.ts
//
// Teammates chat's "generate ad creative briefs" action — pin-down-ad-
// briefs in chat-skill-registry.ts. Reuses buildAdCreativeBriefs exactly
// as onboarding-service.ts calls it (note: that function actually lives
// under pile-on/server/, not pin-down/server/ — an existing cross-feature
// import already established in this codebase, not something new here).
// Same graceful-degradation shape as script-pack-only.ts: only `buyer` is
// required, everything else read straight off the engagement row.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { buildAdCreativeBriefs } from "@/features/pile-on/server/ad-creative-briefs";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runAdCreativeBriefsOnly(
  tenant: {
    engagementId: string;
    buyer: string;
    brandVoiceProfile?: unknown;
    offerDetails?: { name: string; price: string; icp: string; traffic_temperature: string } | null;
    topCallQuestions?: string[] | null;
    topObjections?: string[] | null;
    existingProof?: { testimonials: Array<{ name: string; role: string; company?: string; quote: string }> } | null;
  },
  runId: string,
  step: StepTools | undefined
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    await logStep(runId, { phase: "ad_creative_briefs", status: "running" });
    const { briefs } = await run("ad-creative-briefs", () =>
      buildAdCreativeBriefs(
        {
          buyer: tenant.buyer,
          brandVoiceProfile: tenant.brandVoiceProfile,
          offerDetails: tenant.offerDetails ?? undefined,
          topCallQuestions: tenant.topCallQuestions ?? undefined,
          topObjections: tenant.topObjections ?? undefined,
          existingProof: tenant.existingProof ?? undefined,
        },
        runId
      )
    );

    await run("persist", async () => {
      await db
        .update(engagements)
        .set({ adCreativeBriefs: { generatedAt: new Date().toISOString(), briefs }, updatedAt: new Date() })
        .where(eq(engagements.engagementId, tenant.engagementId));
    });

    await logStep(runId, { phase: "ad_creative_briefs", status: "success", detail: `${briefs.length} briefs generated` });
    summary.whatWasAttempted.push(`Generated ${briefs.length} ad creative briefs across all 4 content pillars for ${tenant.buyer}.`);
    await finishRun(runId, { summary });
  } catch (err) {
    await logStep(runId, { phase: "ad_creative_briefs", status: "failed", detail: err instanceof Error ? err.message : String(err) });
    await failRun(runId, err);
  }
}
