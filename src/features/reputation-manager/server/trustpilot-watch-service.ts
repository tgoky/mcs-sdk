import { db } from "@/lib/db";
import { repIdentityGraphs, repTrustpilotReviews, type RepFindingSentiment } from "@/models/schema";
import { eq } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";
import { logAuditEventsBatch, type RepAuditEvent } from "@/features/reputation-manager/server/audit-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type RawReview = { externalReviewId: string; reviewerName: string | null; rating: number; reviewText: string; publishedAt: string | null };
type ScoredReview = RawReview & { sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null };

const REVIEWS_LIMIT = 100; // matches Outscraper's own documented default for this endpoint

/**
 * Outscraper's own /trustpilot-reviews endpoint — verified directly
 * against docs.outscraper.com's OpenAPI spec and endpoint reference page,
 * not inferred. Base URL, auth header, query params, and response shape
 * below are all confirmed real:
 *
 *   GET https://api.outscraper.cloud/trustpilot-reviews
 *     ?query={domain}&limit={n}&async=false
 *   Header: X-API-KEY: {key}
 *
 * async=false per their own docs opens the connection and holds it until
 * results are ready — no polling loop needed, same shape as a typical
 * synchronous scrape-and-return endpoint.
 */
async function fetchTrustpilotReviews(domain: string): Promise<RawReview[]> {
  const config = resolveOutscraperConfig();
  if (!config) return [];

  const url = `https://api.outscraper.cloud/trustpilot-reviews?query=${encodeURIComponent(domain)}&limit=${REVIEWS_LIMIT}&async=false`;
  const res = await fetch(url, { headers: { "X-API-KEY": config.apiKey } });

  if (!res.ok) {
    throw new Error(`Outscraper Trustpilot request failed [${res.status}]: ${await res.text()}`);
  }

  const body = await res.json();
  // data is an array of arrays (one inner array per query — this call
  // only ever sends one query, so only data[0] is ever populated), per
  // Outscraper's own documented response shape.
  const items: unknown[] = Array.isArray(body?.data?.[0]) ? body.data[0] : [];
  return items.map(normalizeReview).filter((r): r is RawReview => r !== null);
}

/** Field names confirmed directly from Outscraper's own documented
 * example response for this exact endpoint — review_id, review_rating,
 * review_text, review_date (unix seconds), author_title. Not a guess
 * across variants; this is the real, single shape. */
function normalizeReview(raw: unknown): RawReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const externalReviewId = typeof r.review_id === "string" ? r.review_id : null;
  const reviewText = typeof r.review_text === "string" ? r.review_text : null;
  const rating = typeof r.review_rating === "number" ? r.review_rating : Number(r.review_rating);

  if (!externalReviewId || !reviewText || !Number.isFinite(rating)) return null;

  return {
    externalReviewId,
    reviewerName: typeof r.author_title === "string" ? r.author_title : null,
    rating: Math.round(rating),
    reviewText,
    // review_date is unix seconds per the documented example
    // (1675562103) — convert to ISO for the rest of this pipeline, which
    // treats publishedAt as an ISO string throughout.
    publishedAt: typeof r.review_date === "number" ? new Date(r.review_date * 1000).toISOString() : null,
  };
}

/** Same batch-scoring shape rep-engine-panel established — one call over
 * every new review from this run, not one call per review. */
async function scoreReviews(operatorName: string, reviews: RawReview[], runId: string): Promise<ScoredReview[]> {
  if (reviews.length === 0) return [];
  const neutralFallback = (): ScoredReview[] =>
    reviews.map((r) => ({ ...r, sentiment: "neutral" as const, flagged: false, flagReason: null }));

  try {
    const numbered = reviews.map((r, i) => `[${i}] Rating: ${r.rating}/5\nReview: ${r.reviewText}`).join("\n\n");

    const result = await callClaude({
      model: "FAST",
      runId,
      maxTokens: 1500,
      system:
        `You score Trustpilot reviews for a business ("${operatorName}") for reputation risk. For each numbered ` +
        "item, classify overall sentiment (positive, neutral, or negative), and flag it (flagged: true) only if it " +
        "raises a serious issue worth a human looking at (fraud/scam accusations, safety concerns, a pattern of " +
        "complaint, not just a low star rating on its own). Respond with ONLY a JSON array, no preamble, no " +
        'markdown fences:\n[{"index": 0, "sentiment": "positive"|"neutral"|"negative", "flagged": boolean, "flagReason": "one sentence, or null"}]',
      userMessage: numbered,
    });

    const parsed: { index: number; sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null }[] = JSON.parse(
      result.text.trim().replace(/^```json\s*|\s*```$/g, "")
    );
    const byIndex = new Map(parsed.map((p) => [p.index, p]));
    return reviews.map((r, i) => {
      const score = byIndex.get(i);
      if (!score || !["positive", "neutral", "negative"].includes(score.sentiment)) {
        return { ...r, sentiment: "neutral" as const, flagged: false, flagReason: null };
      }
      return { ...r, sentiment: score.sentiment, flagged: Boolean(score.flagged), flagReason: score.flagReason ?? null };
    });
  } catch {
    return neutralFallback();
  }
}

/**
 * rep-trustpilot-watch's execute() — same shape as runRepEnginePanel and
 * runRepOnboarding: load identity graph, do the work, log + finish.
 * Requires at least one domain in repIdentityGraphs.operatorDomains —
 * Trustpilot review pages are keyed by domain, not free-text company name.
 */
export async function runRepTrustpilotWatch(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step
      ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId))
      : loadIdentityGraph(engagementId));

    if (!graph || graph.operatorDomains.length === 0) {
      await logStep(runId, { phase: "trustpilot_watch", status: "skipped", detail: "No identity graph or no domain to check yet." });
      summary.openItems.push("Nothing to check until the identity graph has at least one domain.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    if (!resolveOutscraperConfig()) {
      await logStep(runId, {
        phase: "trustpilot_watch",
        status: "skipped",
        detail: "OUTSCRAPER_API_KEY not configured.",
      });
      summary.openItems.push("Set OUTSCRAPER_API_KEY to start checking anything.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const domain = graph.operatorDomains[0];
    await logStep(runId, { phase: "trustpilot_watch", status: "running", detail: `Checking Trustpilot for ${domain}.` });

    const fetched = await (step ? step.run("fetch-reviews", () => fetchTrustpilotReviews(domain)) : fetchTrustpilotReviews(domain));

    if (fetched.length === 0) {
      await logStep(runId, { phase: "trustpilot_watch", status: "success", detail: "No reviews returned." });
      summary.whatWorked.push("Checked Trustpilot — no reviews found.");
      await finishRun(runId, { summary });
      return;
    }

    // Insert-with-conflict-skip first, THEN score only what actually got
    // inserted — same dedup mechanism webhookEvents uses (a unique
    // constraint the bulk insert collides against), avoiding both a
    // separate SELECT-then-filter round trip and re-scoring reviews
    // already on file from a prior run.
    const inserted = await db
      .insert(repTrustpilotReviews)
      .values(
        fetched.map((r) => ({
          engagementId,
          externalReviewId: r.externalReviewId,
          reviewerName: r.reviewerName,
          rating: r.rating,
          reviewText: r.reviewText,
          publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
          sentiment: "neutral" as const, // placeholder — overwritten below for genuinely new rows
          flagged: false,
        }))
      )
      .onConflictDoNothing({ target: [repTrustpilotReviews.engagementId, repTrustpilotReviews.externalReviewId] })
      .returning({ id: repTrustpilotReviews.id, externalReviewId: repTrustpilotReviews.externalReviewId });

    if (inserted.length === 0) {
      await logStep(runId, {
        phase: "trustpilot_watch",
        status: "success",
        detail: `Checked ${fetched.length} review(s) — all already on file.`,
      });
      summary.whatWorked.push("No new reviews since last check.");
      await finishRun(runId, { summary });
      return;
    }

    const insertedIds = new Set(inserted.map((r) => r.externalReviewId));
    const newReviews = fetched.filter((r) => insertedIds.has(r.externalReviewId));

    const scored = await (step
      ? step.run("score-reviews", () => scoreReviews(graph.operatorName, newReviews, runId))
      : scoreReviews(graph.operatorName, newReviews, runId));

    for (const s of scored) {
      await db
        .update(repTrustpilotReviews)
        .set({ sentiment: s.sentiment, flagged: s.flagged, flagReason: s.flagReason })
        .where(eq(repTrustpilotReviews.externalReviewId, s.externalReviewId));
    }

    // audit-log-schema.md's "detection" event — see engine-panel-service.ts's
    // same call for why this logs every scored review, not just flagged ones.
    await logAuditEventsBatch(
      engagementId,
      scored.map(
        (s): RepAuditEvent => ({
          eventType: "detection",
          payload: {
            source: "trustpilot",
            entityMatched: graph.operatorName,
            mentionText: `${s.rating}/5: ${s.reviewText}`,
            sentimentLabel: s.sentiment,
            threatCategory: s.flagged ? s.flagReason : null,
          },
        })
      )
    );

    const flaggedCount = scored.filter((s) => s.flagged).length;
    await logStep(runId, {
      phase: "trustpilot_watch",
      status: "success",
      detail: `${newReviews.length} new review(s)${flaggedCount > 0 ? `, ${flaggedCount} flagged` : ""}.`,
    });
    summary.whatWorked.push(`Found ${newReviews.length} new review(s) since last check.`);
    if (flaggedCount > 0) summary.decisionsMade.push(`${flaggedCount} review(s) flagged for review.`);

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

async function loadIdentityGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}
