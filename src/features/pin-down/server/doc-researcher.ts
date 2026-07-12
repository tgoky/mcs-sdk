import { callClaudeWithWebSearch } from "@/lib/llm";
import { db } from "@/lib/db";
import { platformAdapterDrafts } from "@/models/schema";
import { eq } from "drizzle-orm";

/**
 * Pin-Down recovery gap 6 — auto-doc-research for unlisted platforms.
 * Per the transfer analysis, this is "the highest-leverage recovery in the
 * Pin-Down bucket" and "what makes UTP genuinely open-ended in the way the
 * Skill Pack was."
 *
 * The OG SKILL.md's behavior: if the buyer's hosting or booking platform
 * wasn't in the supported set, the skill searched the web for developer
 * docs and integrated based on what it found. UTP's booking/hosting enums
 * simply hard-stop on "unsupported."
 *
 * This module is deliberately NOT "generate and run an adapter
 * automatically" — the transfer analysis calls for a human review step
 * ("Once an admin approves the draft, it registers as a runtime adapter
 * for that engagement only"), and unattended codegen against a live
 * buyer credential is exactly the kind of side-effectful, ungated action
 * the broader cross-cutting-principles section flags as reduced
 * ("Every hard change or actual execution requires explicit human
 * confirmation"). So the scope here stops at:
 *
 *   1. Research the platform's public developer docs via Claude's web
 *      search tool (same safe, defensible "public + cited" research
 *      pattern prospect-research.ts already uses for Pre-Call Read).
 *   2. Structure the findings into a reviewable draft: auth method,
 *      relevant endpoints, integration notes, confidence, caveats.
 *   3. Persist it to platform_adapter_drafts with status "pending_review".
 *
 * A human (an admin) reviews the draft via
 * POST /api/pin-down/doc-research/[draftId]/review before anything is
 * ever registered as a live adapter for that one engagement — turning
 * that draft into actual adapter code is Andrew's call per-platform, not
 * something this pass does unattended.
 */

export interface DocResearchResult {
  authMethod?: string;
  relevantEndpoints?: Array<{ method: string; path: string; purpose: string }>;
  integrationNotes?: string;
  confidence: "high" | "medium" | "low";
  caveats: string[];
  docsUrl?: string;
  citedUrls: string[];
}

export async function researchUnlistedPlatform(
  platformKind: "hosting" | "booking",
  platformName: string,
  websiteUrl?: string
): Promise<DocResearchResult> {
  const capability =
    platformKind === "hosting"
      ? "publishing/updating a page on the buyer's site (a REST or GraphQL content API, or a documented deploy hook)"
      : "reading upcoming bookings and receiving webhook notifications for new/cancelled bookings (a REST API with a documented webhook/subscription mechanism)";

  const system = `You are researching third-party developer documentation to scope a new
platform integration. The platform is "${platformName}"${websiteUrl ? ` (${websiteUrl})` : ""}.

Use web search to find this platform's OFFICIAL developer/API
documentation (not third-party tutorials or Stack Overflow unless
official docs genuinely don't exist) and determine whether it supports
${capability}.

Be honest about uncertainty. If you can't find official docs, or the
platform doesn't appear to have a public API at all, say so plainly — do
not invent endpoints or guess at auth schemes. Never fabricate a specific
endpoint path, parameter name, or auth header you didn't actually find in
the docs.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{
  "docsUrl": "the canonical developer docs URL you found, or null",
  "authMethod": "e.g. 'API key in header', 'OAuth 2.0', or null if unclear",
  "relevantEndpoints": [{"method": "GET/POST/etc", "path": "/v1/...", "purpose": "one sentence"}],
  "integrationNotes": "2-4 sentences: what a developer building this adapter needs to know (rate limits, webhook support, gotchas)",
  "confidence": "high" | "medium" | "low",
  "caveats": ["specific things you're uncertain about or that need manual verification before building against this"]
}`;

  const result = await callClaudeWithWebSearch({
    system,
    userMessage: `Research ${platformName}'s developer docs for ${capability}.`,
    maxTokens: 1500,
    maxSearches: 5,
  });

  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      authMethod: parsed.authMethod ?? undefined,
      relevantEndpoints: parsed.relevantEndpoints ?? [],
      integrationNotes: parsed.integrationNotes ?? undefined,
      confidence: parsed.confidence ?? "low",
      caveats: parsed.caveats ?? [],
      docsUrl: parsed.docsUrl ?? result.citedUrls[0],
      citedUrls: result.citedUrls,
    };
  } catch {
    return {
      confidence: "low",
      caveats: [`Research returned an unparseable response: ${result.text.slice(0, 300)}`],
      citedUrls: result.citedUrls,
    };
  }
}

/**
 * Runs the research pass and persists the result as a pending-review draft.
 * Called from an admin-triggered endpoint
 * (POST /api/pin-down/doc-research), never automatically during onboarding
 * — discovering that a platform needs research is instant (the operator
 * picks "discover_from_docs" in the form), but the research itself and the
 * subsequent human review are out-of-band from the onboarding run.
 */
export async function createPlatformAdapterDraft(
  engagementId: string,
  platformKind: "hosting" | "booking",
  platformName: string,
  websiteUrl?: string
): Promise<string> {
  const research = await researchUnlistedPlatform(platformKind, platformName, websiteUrl);

  const [row] = await db
    .insert(platformAdapterDrafts)
    .values({
      engagementId,
      platformKind,
      platformName,
      websiteUrl,
      docsUrl: research.docsUrl,
      researchSummary: {
        authMethod: research.authMethod,
        relevantEndpoints: research.relevantEndpoints,
        integrationNotes: research.integrationNotes,
        confidence: research.confidence,
        caveats: research.caveats,
      },
      status: "pending_review",
    })
    .returning({ id: platformAdapterDrafts.id });

  return row.id;
}

export async function reviewPlatformAdapterDraft(
  draftId: string,
  decision: "approved" | "rejected",
  reviewedBy: string,
  reviewNotes?: string
): Promise<void> {
  await db
    .update(platformAdapterDrafts)
    .set({
      status: decision,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes,
    })
    .where(eq(platformAdapterDrafts.id, draftId));
}
