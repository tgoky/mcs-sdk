import { db } from "@/lib/db";
import { repIdentityGraphs, repTwitterMentions, type RepFindingSentiment } from "@/models/schema";
import { and, eq, inArray } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { resolveTwitterApiKey } from "@/features/reputation-manager/twitter-config";
import { logAuditEventsBatch, type RepAuditEvent } from "@/features/reputation-manager/server/audit-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

type RawMention = {
  externalMentionId: string;
  author: string | null;
  permalink: string;
  mentionText: string;
  publishedAt: string | null;
};
type ScoredMention = RawMention & { sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null };

const RESULTS_LIMIT = 100;
// Confirmed from docs.twitterapis.com: this endpoint always returns
// ~20 tweets per call regardless of any count param, so reaching
// RESULTS_LIMIT means paging with `cursor`, not raising a page-size
// parameter. Capped in real pages, not just a results count, per their
// own guidance ("cap your page count and stop once you have enough") —
// each page is its own billed $0.0008 call.
const MAX_PAGES_PER_TERM = Math.ceil(RESULTS_LIMIT / 20);
const TWITTER_API_BASE = "https://api.twitterapis.com";

/**
 * twitterapis.com's Advanced Tweet Search — confirmed directly against
 * docs.twitterapis.com's own reference page and example response, same
 * verification standard as Outscraper's Trustpilot endpoint and
 * redditapis.com's search endpoints (not inferred):
 *
 *   GET https://api.twitterapis.com/twitter/tweet/advanced_search
 *     ?query={term}&product=Latest&cursor={cursor}
 *   Header: Authorization: Bearer {key}
 *
 * `query` takes full Twitter/X advanced-search operator syntax
 * (from:, since:, min_faves:, lang:, ...) but a plain name/handle works
 * fine as free text with no operators — that's all this needs. Results
 * are cursor-paginated at ~20/call; `count` is accepted but not honored
 * by the upstream, confirmed in their own docs, so reaching
 * RESULTS_LIMIT means following `next_cursor` across multiple calls,
 * stopping early once a page comes back with no tweets (their own
 * pagination note: a non-null cursor can still appear on the last page,
 * so an empty results array — not a null cursor — is the real stop
 * signal).
 */
async function fetchTwitterMentions(searchTerms: string[]): Promise<RawMention[]> {
  const apiKey = resolveTwitterApiKey();
  if (!apiKey) return [];

  const perTermResults = await Promise.all(searchTerms.map((term) => searchTweets(term, apiKey)));

  const combined = perTermResults.flat();
  // The same term can be searched more than once across a client's
  // operator name + high-priority entity names + handle, and the same
  // tweet can legitimately match more than one of those — dedup by the
  // platform's own item id before this goes anywhere near insertion or
  // scoring.
  const seen = new Set<string>();
  return combined.filter((m) => {
    if (seen.has(m.externalMentionId)) return false;
    seen.add(m.externalMentionId);
    return true;
  });
}

async function searchTweets(searchTerm: string, apiKey: string): Promise<RawMention[]> {
  const results: RawMention[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_TERM && results.length < RESULTS_LIMIT; page++) {
    const url = new URL(`${TWITTER_API_BASE}/twitter/tweet/advanced_search`);
    url.searchParams.set("query", searchTerm);
    url.searchParams.set("product", "Latest");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      throw new Error(`twitterapis.com request failed [${res.status}]: ${await res.text()}`);
    }

    const body = await res.json();
    const items: unknown[] = Array.isArray(body?.tweets) ? body.tweets : [];
    if (items.length === 0) break; // the real stop signal per their own pagination docs, not a null next_cursor

    results.push(...items.map(normalizeTweet).filter((m): m is RawMention => m !== null));
    cursor = typeof body?.next_cursor === "string" ? body.next_cursor : undefined;
    if (!cursor) break;
  }

  return results;
}

/** Field names confirmed from docs.twitterapis.com's own documented
 * example response for this exact endpoint — id, text, created_at
 * (Twitter's classic date format, e.g. "Tue Feb 20 14:02:11 +0000 2026" —
 * not ISO 8601, but a format JS's Date constructor parses natively, so
 * no special handling needed), and a nested author.username. There is
 * no url/permalink field in their response at all, confirmed from the
 * same example — the constructed x.com URL below isn't a fallback for
 * an occasionally-missing field, it's the only way to get a link at all
 * from this endpoint. */
function normalizeTweet(raw: unknown): RawMention | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const externalMentionId = typeof r.id === "string" ? r.id : null;
  const mentionText = typeof r.text === "string" ? r.text : null;
  if (!externalMentionId || !mentionText) return null;

  const authorObj = r.author && typeof r.author === "object" ? (r.author as Record<string, unknown>) : null;
  const author = typeof authorObj?.username === "string" ? authorObj.username : null;

  const permalink = author ? `https://x.com/${author}/status/${externalMentionId}` : `https://x.com/i/status/${externalMentionId}`;
  const publishedAt = typeof r.created_at === "string" ? r.created_at : null;

  return { externalMentionId, author, permalink, mentionText, publishedAt };
}

/** Same batch-scoring shape as everywhere else in Reputation Manager. */
async function scoreMentions(operatorName: string, mentions: RawMention[], runId: string): Promise<ScoredMention[]> {
  if (mentions.length === 0) return [];
  const neutralFallback = (): ScoredMention[] =>
    mentions.map((m) => ({ ...m, sentiment: "neutral" as const, flagged: false, flagReason: null }));

  try {
    const numbered = mentions.map((m, i) => `[${i}] @${m.author ?? "unknown"}\n${m.mentionText}`).join("\n\n");

    const result = await callClaude({
      model: "FAST",
      runId,
      maxTokens: 1500,
      system:
        `You score X/Twitter mentions of a business ("${operatorName}") for reputation risk. For each numbered item, ` +
        "classify overall sentiment (positive, neutral, or negative), and flag it (flagged: true) only if it raises " +
        "a serious issue worth a human looking at (fraud/scam accusations, safety concerns, a viral pile-on, a " +
        "pattern of complaint) — most mentions, even lukewarm or joking ones, don't need flagging. Respond with " +
        'ONLY a JSON array, no preamble, no markdown fences:\n[{"index": 0, "sentiment": "positive"|"neutral"|"negative", "flagged": boolean, "flagReason": "one sentence, or null"}]',
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
 * trustpilot-watch-service.ts's processNewReviews and reddit-watch-
 * service.ts's processNewMentions — see either for why this replaced an
 * insert-placeholder-then-update design (a real gap: partial failure
 * between insert and score could leave a row permanently unscored) and
 * why the final insert + audit-log write happen in one transaction
 * inside one step.run (a retry can't duplicate or orphan anything).
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
        .select({ externalMentionId: repTwitterMentions.externalMentionId })
        .from(repTwitterMentions)
        .where(
          and(
            eq(repTwitterMentions.engagementId, engagementId),
            inArray(
              repTwitterMentions.externalMentionId,
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
      .insert(repTwitterMentions)
      .values(
        scored.map((s) => ({
          engagementId,
          externalMentionId: s.externalMentionId,
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
      // inserted the exact same tweet between that select and this
      // insert.
      .onConflictDoNothing({ target: [repTwitterMentions.engagementId, repTwitterMentions.externalMentionId] })
      .returning({ externalMentionId: repTwitterMentions.externalMentionId });

    const insertedIds = new Set(rows.map((r) => r.externalMentionId));
    const inserted = scored.filter((s) => insertedIds.has(s.externalMentionId));

    if (inserted.length > 0) {
      await logAuditEventsBatch(
        engagementId,
        inserted.map(
          (s): RepAuditEvent => ({
            eventType: "detection",
            payload: {
              source: "twitter",
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
 * rep-twitter-watch's execute() — same shape as the Trustpilot and
 * Reddit watch skills. Searches by operator name plus any high-priority
 * entity names, same as Reddit — X mentions are prose/handles, not
 * URL-keyed the way Trustpilot reviews are. Also searches the
 * operator's own @handle (from repIdentityGraphs.operatorHandles["x"],
 * if set) since a direct @mention is one of the most common ways a
 * business actually gets tagged on this platform.
 */
export async function runRepTwitterWatch(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step
      ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId))
      : loadIdentityGraph(engagementId));

    if (!graph) {
      await logStep(runId, { phase: "twitter_watch", status: "skipped", detail: "No identity graph yet." });
      summary.openItems.push("Nothing to check until the identity graph exists.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    if (!resolveTwitterApiKey()) {
      await logStep(runId, {
        phase: "twitter_watch",
        status: "skipped",
        detail: "TWITTERAPIS_API_KEY not configured.",
      });
      summary.openItems.push("Set TWITTERAPIS_API_KEY to start checking anything.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const handle = graph.operatorHandles?.x?.replace(/^@/, "");
    const searchTerms = [
      graph.operatorName,
      ...graph.entities.filter((e) => e.highPriority).map((e) => e.name),
      ...(handle ? [`@${handle}`] : []),
    ];
    await logStep(runId, {
      phase: "twitter_watch",
      status: "running",
      detail: `Searching X for: ${searchTerms.join(", ")}.`,
    });

    const fetched = await (step ? step.run("fetch-mentions", () => fetchTwitterMentions(searchTerms)) : fetchTwitterMentions(searchTerms));

    if (fetched.length === 0) {
      await logStep(runId, { phase: "twitter_watch", status: "success", detail: "No mentions found." });
      summary.whatWorked.push("Searched X — no mentions found.");
      await finishRun(runId, { summary });
      return;
    }

    const result = await (step
      ? step.run("process-new-mentions", () => processNewMentions(engagementId, graph.operatorName, fetched, runId))
      : processNewMentions(engagementId, graph.operatorName, fetched, runId));

    if (result.newCount === 0) {
      await logStep(runId, {
        phase: "twitter_watch",
        status: "success",
        detail: `Checked ${fetched.length} mention(s) — all already on file.`,
      });
      summary.whatWorked.push("No new mentions since last check.");
      await finishRun(runId, { summary });
      return;
    }

    await logStep(runId, {
      phase: "twitter_watch",
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

async function loadIdentityGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}
