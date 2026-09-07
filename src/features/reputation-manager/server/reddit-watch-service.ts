import { db } from "@/lib/db";
import { repIdentityGraphs, repRedditMentions, type RepFindingSentiment } from "@/models/schema";
import { and, eq, inArray } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { resolveRedditApiKey } from "@/features/reputation-manager/reddit-config";
import { logAuditEventsBatch, type RepAuditEvent } from "@/features/reputation-manager/server/audit-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type RawMention = {
  externalMentionId: string;
  subreddit: string;
  author: string | null;
  permalink: string;
  mentionText: string;
  publishedAt: string | null;
};
type ScoredMention = RawMention & { sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null };

const RESULTS_LIMIT = 100;
const REDDIT_API_BASE = "https://api.redditapis.com";

/**
 * redditapis.com's search endpoint — verified directly against their own
 * reference docs (not inferred):
 *
 *   GET https://api.redditapis.com/api/reddit/search?q=&sort=new&limit=
 *   Header: Authorization: Bearer <key>
 *
 * Posts only. An earlier version of this also called
 * "/api/reddit/search/comments" in parallel per search term — that path
 * isn't in the actual reference docs (every real Listings & Search
 * endpoint is listed there exhaustively, and there's no global
 * comment-search-by-keyword among them), so it near-certainly errored on
 * every call, and because both calls shared one Promise.all, that
 * silently failed the entire watch, every run (see fetchRedditMentions's
 * own comment). Multiple terms (operator name plus high-priority entity
 * names — see runRepRedditWatch) are queried in parallel and deduped by
 * Reddit's own item id, since a business is often better known by a
 * brand/entity name than the operator's own name, and the same mention
 * could otherwise match more than one term.
 */
async function fetchRedditMentions(searchTerms: string[]): Promise<RawMention[]> {
  const apiKey = resolveRedditApiKey();
  if (!apiKey) return [];

  // FIX (2026-09-07): this used to also call "/api/reddit/search/comments"
  // in parallel with the real "/api/reddit/search" call. That path isn't a
  // real endpoint — the actual redditapis.com reference docs (obtained and
  // checked directly, not inferred) list every Listings & Search endpoint
  // exhaustively, and there is no global comment-search-by-keyword among
  // them; the closest real thing is a per-subreddit STREAM of newest
  // comments (GET /api/reddit/sub/:name/comments), which searches nothing
  // and needs a subreddit name this function never has. Both calls were
  // wrapped in one Promise.all, so a non-2xx from the comments call (the
  // most likely outcome for a route that isn't real) threw and failed this
  // ENTIRE function — meaning rep-reddit-watch likely never successfully
  // completed a single run against live data, not just "never checked
  // comments." Posts-only now, which is the one endpoint actually
  // confirmed to exist and behave as this file's field-parsing assumes.
  const perTermResults = await Promise.all(searchTerms.map((term) => searchEndpoint("/api/reddit/search", term, apiKey)));

  const combined = perTermResults.flat();
  // The same post/comment can match more than one search term (e.g. both
  // the operator name and an entity name) — dedup by Reddit's own item id
  // before this goes anywhere near insertion or scoring, so a genuinely
  // single mention never gets counted or written twice.
  const seen = new Set<string>();
  return combined.filter((m) => {
    if (seen.has(m.externalMentionId)) return false;
    seen.add(m.externalMentionId);
    return true;
  });
}

async function searchEndpoint(path: string, searchTerm: string, apiKey: string, timeframe?: string): Promise<RawMention[]> {
  const url = new URL(REDDIT_API_BASE + path);
  url.searchParams.set("q", searchTerm);
  // Real, documented technique for reaching further back than the
  // regular watch's recency-sorted window — confirmed against the actual
  // /api/reddit/search reference docs, not inferred: sort=top/
  // controversial are "the axes that reliably reach older posts," and a
  // given t (timeframe) value is its own separate listing on this
  // endpoint specifically ("we forward it on every sort"), meant to be
  // combined across values to widen coverage rather than assumed to
  // exhaust a subreddit's full history in one call.
  if (timeframe) {
    url.searchParams.set("sort", "top");
    url.searchParams.set("t", timeframe);
  } else {
    url.searchParams.set("sort", "new");
  }
  url.searchParams.set("limit", String(RESULTS_LIMIT));
  // Their docs are explicit that nsfw defaults to excluded — "Omitted or
  // false excludes them" — which for a reputation monitor is a real
  // coverage gap, not a feature: a genuine complaint thread that Reddit
  // happens to have flagged NSFW (common for e.g. adult-adjacent
  // industries, or a spicy/controversial thread auto-tagged that way)
  // would otherwise never reach this search at all. We score sentiment
  // downstream regardless of the flag, so there's no reason to pre-filter
  // it out at the source.
  url.searchParams.set("nsfw", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`redditapis.com request failed [${res.status}] for ${path}: ${await res.text()}`);
  }

  const body = await res.json();
  // FIX (2026-09-07): confirmed against the real /api/reddit/search
  // reference docs — the response shape is exactly { posts: [...], after }
  // and nothing else; there's no "comments" or "results" key on this
  // endpoint (those were speculative fallbacks written before the real
  // docs were available, kept "just in case," which is exactly the kind
  // of unverified hedge this codebase's own conventions are usually
  // careful to avoid — removed now that there's a real answer).
  const items: unknown[] = Array.isArray(body?.posts) ? body.posts : [];
  return items.map(normalizeMention).filter((m): m is RawMention => m !== null);
}

/** FIX (2026-09-07): field names now fully confirmed against the real
 * /api/reddit/search (and /api/reddit/posts, same shape) response
 * example — id, permalink, text (self posts) / title (link posts,
 * fallback), subreddit, author, created (ISO string), created_utc (unix
 * epoch seconds). No `createdAt` field exists on the real response —
 * that was a guess in the original, unverified version of this function;
 * kept in the fallback chain below only because it's a harmless no-op
 * (undefined, falls through to the real `created` field), not because
 * it's real. */
function normalizeMention(raw: unknown): RawMention | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const externalMentionId = typeof r.id === "string" ? r.id : null;
  const permalink = typeof r.permalink === "string" ? r.permalink : null;
  const text = typeof r.text === "string" ? r.text : typeof r.title === "string" ? r.title : null;
  const subreddit = typeof r.subreddit === "string" ? r.subreddit : null;

  if (!externalMentionId || !permalink || !text || !subreddit) return null;

  const rawCreated = r.created ?? r.created_utc;
  const publishedAt =
    typeof rawCreated === "string"
      ? rawCreated
      : typeof rawCreated === "number"
        ? new Date(rawCreated * (rawCreated < 1e12 ? 1000 : 1)).toISOString()
        : null;

  return {
    externalMentionId,
    subreddit,
    author: typeof r.author === "string" ? r.author : null,
    permalink: permalink.startsWith("http") ? permalink : `https://reddit.com${permalink}`,
    mentionText: text,
    publishedAt,
  };
}

/** Same batch-scoring shape as everywhere else in Reputation Manager. */
async function scoreMentions(operatorName: string, mentions: RawMention[], runId: string): Promise<ScoredMention[]> {
  if (mentions.length === 0) return [];
  const neutralFallback = (): ScoredMention[] =>
    mentions.map((m) => ({ ...m, sentiment: "neutral" as const, flagged: false, flagReason: null }));

  try {
    const numbered = mentions.map((m, i) => `[${i}] r/${m.subreddit}\n${m.mentionText}`).join("\n\n");

    const result = await callClaude({
      model: "FAST",
      runId,
      maxTokens: 1500,
      system:
        `You score Reddit mentions of a business ("${operatorName}") for reputation risk. For each numbered item, ` +
        "classify overall sentiment (positive, neutral, or negative), and flag it (flagged: true) only if it raises " +
        "a serious issue worth a human looking at (fraud/scam accusations, safety concerns, a pattern of " +
        "complaint) — most mentions, even lukewarm or joking ones, don't need flagging. Respond with ONLY a JSON " +
        'array, no preamble, no markdown fences:\n[{"index": 0, "sentiment": "positive"|"neutral"|"negative", "flagged": boolean, "flagReason": "one sentence, or null"}]',
      userMessage: numbered,
    });

    const parsed: { index: number; sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null }[] = JSON.parse(
      result.text.trim().replace(/^```json\s*|\s*```$/g, "")
    );
    const byIndex = new Map(parsed.map((p) => [p.index, p]));
    return mentions.map((m, i) => {
      const score = byIndex.get(i);
      if (!score || !["positive", "neutral", "negative"].includes(score.sentiment)) {
        return { ...m, sentiment: "neutral" as const, flagged: false, flagReason: null };
      }
      return { ...m, sentiment: score.sentiment, flagged: Boolean(score.flagged), flagReason: score.flagReason ?? null };
    });
  } catch {
    return neutralFallback();
  }
}

/**
 * Same select-then-score-then-insert-already-scored shape as
 * trustpilot-watch-service.ts's processNewReviews (see that function's
 * own comment for why this replaced a placeholder-insert-then-update
 * design) — plus one more thing that shape happens to fix for free here:
 * the old update-by-externalMentionId step scoped ONLY by that id, with
 * no engagementId in the WHERE clause. Reddit's item ids are globally
 * unique across all of Reddit, not per-client, so if two different
 * engagements were ever mentioned in the same thread, one engagement's
 * scoring pass could silently overwrite the other's sentiment/flag data.
 * There's no update-by-bare-id anywhere now — every insert is scoped by
 * (engagementId, externalMentionId) from the start.
 */
async function processNewMentions(
  engagementId: string,
  operatorName: string,
  fetched: RawMention[],
  runId: string
): Promise<{ newCount: number; flaggedCount: number }> {
  const existingIds = new Set(
    (
      await db
        .select({ externalMentionId: repRedditMentions.externalMentionId })
        .from(repRedditMentions)
        .where(
          and(
            eq(repRedditMentions.engagementId, engagementId),
            inArray(
              repRedditMentions.externalMentionId,
              fetched.map((m) => m.externalMentionId)
            )
          )
        )
    ).map((r) => r.externalMentionId)
  );

  const newRaw = fetched.filter((m) => !existingIds.has(m.externalMentionId));
  if (newRaw.length === 0) return { newCount: 0, flaggedCount: 0 };

  const scored = await scoreMentions(operatorName, newRaw, runId);

  const actuallyInserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(repRedditMentions)
      .values(
        scored.map((s) => ({
          engagementId,
          externalMentionId: s.externalMentionId,
          subreddit: s.subreddit,
          author: s.author,
          permalink: s.permalink,
          mentionText: s.mentionText,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
          sentiment: s.sentiment,
          flagged: s.flagged,
          flagReason: s.flagReason,
        }))
      )
      // Safety net, not the primary dedup mechanism (the select above
      // already is) — only matters if a different engagement's run
      // inserted the exact same Reddit item between that select and this
      // insert.
      .onConflictDoNothing({ target: [repRedditMentions.engagementId, repRedditMentions.externalMentionId] })
      .returning({ externalMentionId: repRedditMentions.externalMentionId });

    const insertedIds = new Set(rows.map((r) => r.externalMentionId));
    const inserted = scored.filter((s) => insertedIds.has(s.externalMentionId));

    if (inserted.length > 0) {
      await logAuditEventsBatch(
        engagementId,
        inserted.map(
          (s): RepAuditEvent => ({
            eventType: "detection",
            payload: {
              source: "reddit",
              sourceUrl: s.permalink,
              entityMatched: operatorName,
              mentionText: s.mentionText,
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
 * rep-reddit-watch's execute() — same shape as the Trustpilot and
 * AI-engine-panel skills. Searches by operator name (not domain — Reddit
 * mentions are prose, not URL-keyed the way Trustpilot reviews are).
 */
export async function runRepRedditWatch(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step
      ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId))
      : loadIdentityGraph(engagementId));

    if (!graph) {
      await logStep(runId, { phase: "reddit_watch", status: "skipped", detail: "No identity graph yet." });
      summary.openItems.push("Nothing to check until the identity graph exists.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    if (!resolveRedditApiKey()) {
      await logStep(runId, {
        phase: "reddit_watch",
        status: "skipped",
        detail: "REDDITAPIS_API_KEY not configured.",
      });
      summary.openItems.push("Set REDDITAPIS_API_KEY to start checking anything.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const searchTerms = [graph.operatorName, ...graph.entities.filter((e) => e.highPriority).map((e) => e.name)];
    await logStep(runId, {
      phase: "reddit_watch",
      status: "running",
      detail: `Searching Reddit for: ${searchTerms.join(", ")}.`,
    });

    const fetched = await (step ? step.run("fetch-mentions", () => fetchRedditMentions(searchTerms)) : fetchRedditMentions(searchTerms));

    if (fetched.length === 0) {
      await logStep(runId, { phase: "reddit_watch", status: "success", detail: "No mentions found." });
      summary.whatWorked.push("Searched Reddit — no mentions found.");
      await finishRun(runId, { summary });
      return;
    }

    // One step: dedupe, score only what's new, insert already-scored, and
    // log — see processNewMentions's own comment for why this replaced
    // the old two-phase placeholder-then-update design (and fixed the
    // missing-engagementId-scope bug on the old update). Wrapped in
    // step.run so an Inngest retry replays the memoized result instead of
    // re-scoring or re-inserting anything that already committed.
    const result = await (step
      ? step.run("process-new-mentions", () => processNewMentions(engagementId, graph.operatorName, fetched, runId))
      : processNewMentions(engagementId, graph.operatorName, fetched, runId));

    if (result.newCount === 0) {
      await logStep(runId, {
        phase: "reddit_watch",
        status: "success",
        detail: `Checked ${fetched.length} mention(s) — all already on file.`,
      });
      summary.whatWorked.push("No new mentions since last check.");
      await finishRun(runId, { summary });
      return;
    }

    await logStep(runId, {
      phase: "reddit_watch",
      status: "success",
      detail: `${result.newCount} new mention(s)${result.flaggedCount > 0 ? `, ${result.flaggedCount} flagged` : ""}.`,
    });
    summary.whatWorked.push(`Found ${result.newCount} new mention(s) since last check.`);
    if (result.flaggedCount > 0) summary.decisionsMade.push(`${result.flaggedCount} mention(s) flagged for review.`);

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

const VALID_REDDIT_TIMEFRAMES = ["hour", "day", "week", "month", "year", "all"];

/**
 * Teammates chat's "widen the Reddit scan beyond the daily watch" action
 * — rep-reddit-deep-scan in chat-skill-registry.ts. Coarser than the
 * Trustpilot/X deep scans on purpose: /api/reddit/search has no exact
 * "since this date" parameter the way Outscraper's cutoff or X's since:
 * operator does — the real, documented mechanism here is combining
 * distinct t (timeframe) values with sort=top, each one a genuinely
 * separate listing per their own docs, not a single call reaching
 * further back. Only queries /api/reddit/search — deliberately NOT
 * /api/reddit/search/comments, which isn't in the reference docs that
 * were actually verified for this build (see this file's own header) and
 * isn't safe to build on until that's confirmed for real.
 */
export async function runRepRedditDeepScan(
  tenant: { engagementId: string },
  runId: string,
  step: StepTools | undefined,
  ctx?: { deepScanTimeframe?: string }
): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const timeframe = ctx?.deepScanTimeframe?.trim().toLowerCase();
    if (!timeframe || !VALID_REDDIT_TIMEFRAMES.includes(timeframe)) {
      throw new Error(`A timeframe is required — one of: ${VALID_REDDIT_TIMEFRAMES.join(", ")}.`);
    }

    const graph = await (step ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId)) : loadIdentityGraph(engagementId));

    if (!graph) {
      throw new Error("Reputation Manager's Identity Setup hasn't been completed for this client yet.");
    }
    if (!resolveRedditApiKey()) {
      throw new Error("REDDITAPIS_API_KEY not configured.");
    }

    const apiKey = resolveRedditApiKey()!;
    const searchTerms = [graph.operatorName, ...graph.entities.filter((e) => e.highPriority).map((e) => e.name)];

    await logStep(runId, { phase: "reddit_deep_scan", status: "running", detail: `Widening Reddit search (t=${timeframe}, sort=top) for: ${searchTerms.join(", ")}.` });

    const fetchWide = async () => {
      const perTermResults = await Promise.all(searchTerms.map((term) => searchEndpoint("/api/reddit/search", term, apiKey, timeframe)));
      const combined = perTermResults.flat();
      const seen = new Set<string>();
      return combined.filter((m) => {
        if (seen.has(m.externalMentionId)) return false;
        seen.add(m.externalMentionId);
        return true;
      });
    };

    const fetched = await (step ? step.run("fetch-mentions-wide", fetchWide) : fetchWide());

    if (fetched.length === 0) {
      await logStep(runId, { phase: "reddit_deep_scan", status: "success", detail: "No mentions found in that window." });
      summary.whatWorked.push(`Widened the Reddit scan to t=${timeframe} — no mentions found.`);
      await finishRun(runId, { summary });
      return;
    }

    const result = await (step
      ? step.run("process-new-mentions", () => processNewMentions(engagementId, graph.operatorName, fetched, runId))
      : processNewMentions(engagementId, graph.operatorName, fetched, runId));

    await logStep(runId, {
      phase: "reddit_deep_scan",
      status: "success",
      detail: `${result.newCount} new mention(s)${result.flaggedCount > 0 ? `, ${result.flaggedCount} flagged` : ""} found widening to t=${timeframe}.`,
    });
    summary.whatWorked.push(`Widened the Reddit scan to t=${timeframe} (sort=top) — found ${result.newCount} new mention(s) beyond what the regular recency-sorted watch already had on file.`);
    if (result.flaggedCount > 0) summary.decisionsMade.push(`${result.flaggedCount} mention(s) flagged for review.`);

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