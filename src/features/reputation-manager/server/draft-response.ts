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
import type { ResponsePostureId } from "@/features/reputation-manager/rep-thresholds";
import { RESPONSE_POSTURES } from "@/features/reputation-manager/rep-thresholds";

type StepTools = GetStepTools<Inngest.Any>;

export const PLATFORM_LABELS: Record<string, string> = {
  trustpilot: "Trustpilot",
  reddit: "Reddit",
  twitter: "X/Twitter",
  engine_panel: "an AI engine's answer",
};

function postureInstruction(posture: ResponsePostureId | undefined): string {
  if (!posture) return "";
  const label = RESPONSE_POSTURES.find((p) => p.id === posture)?.label;
  switch (posture) {
    case "acknowledge_private_resolution":
      return " The sole authority has chosen this posture: acknowledge the concern and invite the person to continue privately (e.g. email/DM) rather than litigating details publicly.";
    case "factual_correction":
      return " The sole authority has chosen this posture: correct the specific factual inaccuracy plainly and non-defensively, without arguing tone or intent.";
    case "monitor_only":
      return " The sole authority has chosen to not respond publicly at all — draft only an internal note summarizing why, not a public-facing reply.";
    case "escalate_externally":
      return "";
    default:
      return label ? ` The sole authority has chosen this posture: ${label}.` : "";
  }
}

/**
 * Reusable drafting core — shared by the manual Teammates-chat action below
 * and response-routing.ts's automatic tier 1/2/3 drafting. Never posts
 * anything anywhere (see file header); always returns text for a human to
 * review, edit, and post themselves. `posture` is only ever set for a tier
 * 3 draft, generated after the sole authority has picked one — see
 * response-routing.ts and thresholds.yml.template's "the choice itself is
 * the load-bearing operator judgment."
 */
export async function draftResponseText(params: {
  operatorName: string;
  findingText: string;
  platformLabel: string;
  brandVoice?: unknown;
  posture?: ResponsePostureId;
  runId: string;
}): Promise<string> {
  const voiceContext = params.brandVoice ? `\n\nThe operator's established brand voice (match this tone): ${JSON.stringify(params.brandVoice).slice(0, 800)}` : "";

  const result = await callClaude({
    model: "FAST",
    runId: params.runId,
    maxTokens: 500,
    system:
      `You draft a professional, de-escalating public response on behalf of a business ("${params.operatorName}") to a ${params.platformLabel} finding about them. ` +
      "The response should: acknowledge the concern genuinely without being defensive, avoid admitting fault for anything not confirmed, invite the person to continue the conversation privately if it's a genuine complaint, and stay concise (2-4 sentences) and human, not corporate-sounding. " +
      "Never fabricate specific facts, promises, or offers on the operator's behalf — keep it general enough that a human can add specifics before posting." +
      postureInstruction(params.posture) +
      `Respond with ONLY the drafted response text, no preamble, no quotation marks around it.${voiceContext}`,
    userMessage: `The ${params.platformLabel} finding to respond to:\n\n${params.findingText}`,
  });

  return result.text.trim();
}

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

    const draft = await run("generate-draft", () =>
      draftResponseText({ operatorName: graph.operatorName, findingText, platformLabel, brandVoice, runId })
    );

    await logStep(runId, { phase: "draft_response", status: "success", detail: "Draft ready." });
    summary.whatWorked.push(`Drafted a suggested response to the ${platformLabel} finding: "${draft}"`);
    summary.openItems.push("This draft was not posted anywhere — review and edit it, then post it manually wherever the original finding was.");

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
