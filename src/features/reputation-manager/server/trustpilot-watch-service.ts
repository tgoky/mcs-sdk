import { db } from "@/lib/db";
import { repIdentityGraphs, repTrustpilotReviews, type RepFindingSentiment } from "@/models/schema";
import { and, eq, inArray } from "drizzle-orm";
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
 *     ?query={domain}&limit={n}&sort=recency&async=false
 *   Header: X-API-KEY: {key}
 *
 * sort=recency (the only real value that param takes, per their own
 * docs) matters more than it looks: this only ever fetches the top
 * REVIEWS_LIMIT reviews per check, and dedupes against what's already
 * stored to find what's new. Without an explicit sort, a business with
 * more than REVIEWS_LIMIT total reviews has no guarantee those top-100
 * are the newest ones — a genuinely new review could land outside that
 * window and never surface in any future check either, not just get
 * delayed. Newest-first ordering is what makes "top 100" reliably mean
 * "everything published since last time" instead of an arbitrary slice.
 *
 * async=false per their own docs opens the connection and holds it until
 * results are ready — no polling loop needed, same shape as a typical
 * synchronous scrape-and-return endpoint. Their docs recommend async=true
 * for calls that may run long (large batches, enrichments); a single-
 * domain review fetch is small enough that the simpler synchronous call
 * is the right tradeoff here — a timeout still fails cleanly into
 * Inngest's normal retry path (see runRepTrustpilotWatch's catch block).
 */
async function fetchTrustpilotReviews(domain: string): Promise<RawReview[]> {
  const config = resolveOutscraperConfig();
  if (!config) return [];

  const url = `https://api.outscraper.cloud/trustpilot-reviews?query=${encodeURIComponent(domain)}&limit=${REVIEWS_LIMIT}&sort=recency&async=false`;
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
 * Dedupes against what's already stored, scores only the genuinely new
 * reviews, then inserts them already-scored — never a placeholder row
 * scored in a second pass. That two-phase design (insert neutral/
 * unflagged placeholders, then UPDATE them with real scores) had a real
 * gap: if anything failed between the insert and the update (a transient
 * DB blip, the audit-log write), the placeholder row was stuck unscored
 * forever, and a retry's dedup insert would see it as "already on file"
 * and report success — silently losing the score, permanently. There's
 * no placeholder state to get stuck in now: insert + the matching audit
 * log entries happen in one transaction, so a retry either finds nothing
 * committed (redoes the full select-score-insert-log cycle cleanly) or
 * finds a fully-formed, already-scored, already-logged row.
 */
async function processNewReviews(
  engagementId: string,
  operatorName: string,
  fetched: RawReview[],
  runId: string
): Promise<{ newCount: number; flaggedCount: number }> {
  const existingIds = new Set(
    (
      await db
        .select({ externalReviewId: repTrustpilotReviews.externalReviewId })
        .from(repTrustpilotReviews)
        .where(
          and(
            eq(repTrustpilotReviews.engagementId, engagementId),
            inArray(
              repTrustpilotReviews.externalReviewId,
              fetched.map((r) => r.externalReviewId)
            )
          )
        )
    ).map((r) => r.externalReviewId)
  );

  const newRaw = fetched.filter((r) => !existingIds.has(r.externalReviewId));
  if (newRaw.length === 0) return { newCount: 0, flaggedCount: 0 };

  const scored = await scoreReviews(operatorName, newRaw, runId);

  const actuallyInserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(repTrustpilotReviews)
      .values(
        scored.map((s) => ({
          engagementId,
          externalReviewId: s.externalReviewId,
          reviewerName: s.reviewerName,
          rating: s.rating,
          reviewText: s.reviewText,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
          sentiment: s.sentiment,
          flagged: s.flagged,
          flagReason: s.flagReason,
        }))
      )
      // Safety net, not the primary dedup mechanism (the select above
      // already is) — only matters if a different engagement watching
      // the same domain inserted the exact same review between that
      // select and this insert.
      .onConflictDoNothing({ target: [repTrustpilotReviews.engagementId, repTrustpilotReviews.externalReviewId] })
      .returning({ externalReviewId: repTrustpilotReviews.externalReviewId });

    const insertedIds = new Set(rows.map((r) => r.externalReviewId));
    const inserted = scored.filter((s) => insertedIds.has(s.externalReviewId));

    if (inserted.length > 0) {
      // audit-log-schema.md's "detection" event, logged in the SAME
      // transaction as the insert it describes — see this function's own
      // comment for why that matters.
      await logAuditEventsBatch(
        engagementId,
        inserted.map(
          (s): RepAuditEvent => ({
            eventType: "detection",
            payload: {
              source: "trustpilot",
              entityMatched: operatorName,
              mentionText: `${s.rating}/5: ${s.reviewText}`,
              sentimentLabel: s.sentiment,
              threatCategory: s.flagged ? s.flagReason : null,
            },
          })
        ),
        tx
      );
    }

    return inserted;
  });

  return { newCount: actuallyInserted.length, flaggedCount: actuallyInserted.filter((s) => s.flagged).length };
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

    // One step: dedupe, score only what's new, insert already-scored, and
    // log — see processNewReviews's own comment for why this replaced the
    // old two-phase placeholder-then-update design. Wrapped in step.run so
    // an Inngest retry replays the whole memoized result instead of
    // re-scoring or re-inserting anything that already committed.
    const result = await (step
      ? step.run("process-new-reviews", () => processNewReviews(engagementId, graph.operatorName, fetched, runId))
      : processNewReviews(engagementId, graph.operatorName, fetched, runId));

    if (result.newCount === 0) {
      await logStep(runId, {
        phase: "trustpilot_watch",
        status: "success",
        detail: `Checked ${fetched.length} review(s) — all already on file.`,
      });
      summary.whatWorked.push("No new reviews since last check.");
      await finishRun(runId, { summary });
      return;
    }

    await logStep(runId, {
      phase: "trustpilot_watch",
      status: "success",
      detail: `${result.newCount} new review(s)${result.flaggedCount > 0 ? `, ${result.flaggedCount} flagged` : ""}.`,
    });
    summary.whatWorked.push(`Found ${result.newCount} new review(s) since last check.`);
    if (result.flaggedCount > 0) summary.decisionsMade.push(`${result.flaggedCount} review(s) flagged for review.`);

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
