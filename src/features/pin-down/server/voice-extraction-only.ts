// src/features/pin-down/server/voice-extraction-only.ts
//
// Teammates chat's "extract brand voice from this URL" action —
// pin-down-voice in chat-skill-registry.ts. Same two real building
// blocks the full Pin-Down onboarding uses (scrapeVoiceCorpus,
// extractVoiceProfile, exported from onboarding-service.ts specifically
// for this reuse), run standalone rather than as one step inside the
// whole wizard flow. Persists straight to engagements.brandVoiceProfile
// — the exact same column, and (if not already set) engagements.stack's
// buyer_domain — so a client set up this way looks identical to one the
// full wizard onboarded, not a lesser or parallel copy of that data.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { scrapeVoiceCorpus } from "./voice-scraper";
import { extractVoiceProfile } from "./onboarding-service";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runVoiceExtractionOnly(
  tenant: { engagementId: string; buyer: string; stack?: Partial<EngagementStack> | null },
  runId: string,
  step: StepTools | undefined,
  ctx?: { voiceExtractionDomain?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const domain = ctx?.voiceExtractionDomain?.trim();
    if (!domain) throw new Error("No URL was provided to extract brand voice from.");

    await logStep(runId, { phase: "voice_scrape", status: "running", label: domain });
    const { corpus, sources } = await run("voice-scrape", () => scrapeVoiceCorpus(domain, runId));
    await logStep(runId, { phase: "voice_scrape", status: "success", detail: `${sources.length} source${sources.length === 1 ? "" : "s"} scraped` });

    await logStep(runId, { phase: "voice_extraction", status: "running" });
    const voiceProfile = await run("voice-extraction", () => extractVoiceProfile(corpus, runId));
    await logStep(runId, { phase: "voice_extraction", status: "success" });

    await run("persist", async () => {
      const existingStack = (tenant.stack as Partial<EngagementStack> | null) ?? {};
      const nextStack: Partial<EngagementStack> = existingStack.buyer_domain ? existingStack : { ...existingStack, buyer_domain: domain };
      await db
        .update(engagements)
        .set({ brandVoiceProfile: voiceProfile, stack: nextStack as EngagementStack, updatedAt: new Date() })
        .where(eq(engagements.engagementId, tenant.engagementId));
    });

    summary.whatWasAttempted.push(`Extracted brand voice for ${tenant.buyer} from ${domain}.`);
    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err);
  }
}
