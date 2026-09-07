// src/features/reputation-manager/server/draft-response.ts
//
// Teammates chat's "draft a response to this finding" action —
// rep-draft-response in chat-skill-registry.ts. Closes the loop the
// watch skills otherwise leave open: Trustpilot/Reddit/Twitter watch
// flag something and stop there — nothing in the app today turns a
// flagged finding into a next step. This doesn't post anything anywhere
// (no Trustpilot API for posting a reply, no Reddit/X post capability
// wired up here, deliberately) — it drafts a suggested response via
// Claude, using the operator's own name and (when available) brand voice
// for tone, and relays it back through the run's summary for a human to
// review, edit, and post themselves wherever it actually needs to go.

import { db } from "@/lib/db";
import { repIdentityGraphs, engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const PLATFORM_LABELS: Record<string, string> = {
  trustpilot: "Trustpilot",
  reddit: "Reddit",
  twitter: "X/Twitter",
  engine_panel: "an AI engine's answer",
};

export async function runDraftResponse(
  tenant: { engagementId: string },
  runId: string,
  step: StepTools | undefined,
  ctx?: { findingText?: string; findingPlatform?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const findingText = ctx?.findingText?.trim();
    if (!findingText) {
      throw new Error("No finding text was provided to draft a response to.");
    }
    const platform = ctx?.findingPlatform?.trim().toLowerCase();
    const platformLabel = platform && PLATFORM_LABELS[platform] ? PLATFORM_LABELS[platform] : "this";

    const [graph, brandVoice] = await run("load-context", async () => {
      const [graphRow] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, tenant.engagementId)).limit(1);
      const [engagementRow] = await db.select({ brandVoiceProfile: engagements.brandVoiceProfile }).from(engagements).where(eq(engagements.engagementId, tenant.engagementId)).limit(1);
      return [graphRow ?? null, engagementRow?.brandVoiceProfile ?? null] as const;
    });

    if (!graph) {
      throw new Error("Reputation Manager's Identity Setup hasn't been completed for this client yet.");
    }

    await logStep(runId, { phase: "draft_response", status: "running", detail: `Drafting a response to ${platformLabel} finding.` });

    const voiceContext = brandVoice ? `\n\nThe operator's established brand voice (match this tone): ${JSON.stringify(brandVoice).slice(0, 800)}` : "";

    const result = await run("generate-draft", () =>
      callClaude({
        model: "FAST",
        runId,
        maxTokens: 500,
        system:
          `You draft a professional, de-escalating public response on behalf of a business ("${graph.operatorName}") to a ${platformLabel} finding about them. ` +
          "The response should: acknowledge the concern genuinely without being defensive, avoid admitting fault for anything not confirmed, invite the person to continue the conversation privately if it's a genuine complaint, and stay concise (2-4 sentences) and human, not corporate-sounding. " +
          "Never fabricate specific facts, promises, or offers on the operator's behalf — keep it general enough that a human can add specifics before posting. " +
          `Respond with ONLY the drafted response text, no preamble, no quotation marks around it.${voiceContext}`,
        userMessage: `The ${platformLabel} finding to respond to:\n\n${findingText}`,
      })
    );

    const draft = result.text.trim();

    await logStep(runId, { phase: "draft_response", status: "success", detail: "Draft ready." });
    summary.whatWorked.push(`Drafted a suggested response to the ${platformLabel} finding: "${draft}"`);
    summary.openItems.push("This draft was not posted anywhere — review and edit it, then post it manually wherever the original finding was.");

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
