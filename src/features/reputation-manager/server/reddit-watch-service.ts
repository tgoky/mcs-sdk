import { db } from "@/lib/db";
import { repIdentityGraphs, repRedditMentions, type RepFindingSentiment } from "@/models/schema";
import { eq } from "drizzle-orm";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { resolveRedditApiKey } from "@/features/reputation-manager/reddit-config";
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
 * redditapis.com's search endpoints — verified directly against their
 * own docs (docs.redditapis.com, www.redditapis.com/reddit-search-api,
 * www.redditapis.com/reddit-monitoring-api), not inferred:
 *
 *   GET https://api.redditapis.com/api/reddit/search?q=&sort=new&limit=
 *   GET https://api.redditapis.com/api/reddit/search/comments?q=&sort=new&limit=
 *   Header: Authorization: Bearer <key>
 *
 * Both endpoints are queried per search term — their own monitoring-API
 * page is explicit that "most conversations that matter happen in the
 * comments," and a post-only search misses a mention buried in a reply
 * thread. Multiple terms (operator name plus high-priority entity names
 * — see runRepRedditWatch) are queried in parallel and deduped by
 * Reddit's own item id, since a business is often better known by a
 * brand/entity name than the operator's own name, and the same mention
 * could otherwise match more than one term.
 */
async function fetchRedditMentions(searchTerms: string[]): Promise<RawMention[]> {
  const apiKey = resolveRedditApiKey();
  if (!apiKey) return [];

  const perTermResults = await Promise.all(
    searchTerms.map((term) =>
      Promise.all([searchEndpoint("/api/reddit/search", term, apiKey), searchEndpoint("/api/reddit/search/comments", term, apiKey)])
    )
  );

  const combined = perTermResults.flat(2);
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

async function searchEndpoint(path: string, searchTerm: string, apiKey: string): Promise<RawMention[]> {
  const url = new URL(REDDIT_API_BASE + path);
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("sort", "new");
  url.searchParams.set("limit", String(RESULTS_LIMIT));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`redditapis.com request failed [${res.status}] for ${path}: ${await res.text()}`);
  }

  const body = await res.json();
  // Posts search responds { posts: [...] } per their documented example;
  // comment search follows the same top-level shape with its own key.
  // Checked defensively for whichever key is actually populated rather
  // than assuming one, since this is the one part of their response
  // shape not shown verbatim in a copy-paste example for the comments
  // variant specifically.
  const items: unknown[] = Array.isArray(body?.posts)
    ? body.posts
    : Array.isArray(body?.comments)
      ? body.comments
      : Array.isArray(body?.results)
        ? body.results
        : [];
  return items.map(normalizeMention).filter((m): m is RawMention => m !== null);
}

/** Field names confirmed from redditapis.com's own documented example —
 * title/text, author, upvotes, permalink — plus `id`, which their own
 * FAQ confirms exists on every post/comment specifically for dedup
 * ("Dedupe on the item id Reddit returns for every post and comment"). */
function normalizeMention(raw: unknown): RawMention | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const externalMentionId = typeof r.id === "string" ? r.id : null;
  const permalink = typeof r.permalink === "string" ? r.permalink : null;
  const text = typeof r.text === "string" ? r.text : typeof r.title === "string" ? r.title : null;
  const subreddit = typeof r.subreddit === "string" ? r.subreddit : null;

  if (!externalMentionId || !permalink || !text || !subreddit) return null;

  return {
    externalMentionId,
    subreddit,
    author: typeof r.author === "string" ? r.author : null,
    permalink: permalink.startsWith("http") ? permalink : `https://reddit.com${permalink}`,
    mentionText: text,
    publishedAt: typeof r.createdAt === "string" ? r.createdAt : null,
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

    // Same insert-with-conflict-skip-then-score-only-what's-new pattern as
    // trustpilot-watch-service.ts.
    const inserted = await db
      .insert(repRedditMentions)
      .values(
        fetched.map((m) => ({
          engagementId,
          externalMentionId: m.externalMentionId,
          subreddit: m.subreddit,
          author: m.author,
          permalink: m.permalink,
          mentionText: m.mentionText,
          publishedAt: m.publishedAt ? new Date(m.publishedAt) : null,
          sentiment: "neutral" as const,
          flagged: false,
        }))
      )
      .onConflictDoNothing({ target: [repRedditMentions.engagementId, repRedditMentions.externalMentionId] })
      .returning({ id: repRedditMentions.id, externalMentionId: repRedditMentions.externalMentionId });

    if (inserted.length === 0) {
      await logStep(runId, {
        phase: "reddit_watch",
        status: "success",
        detail: `Checked ${fetched.length} mention(s) — all already on file.`,
      });
      summary.whatWorked.push("No new mentions since last check.");
      await finishRun(runId, { summary });
      return;
    }

    const insertedIds = new Set(inserted.map((m) => m.externalMentionId));
    const newMentions = fetched.filter((m) => insertedIds.has(m.externalMentionId));

    const scored = await (step
      ? step.run("score-mentions", () => scoreMentions(graph.operatorName, newMentions, runId))
      : scoreMentions(graph.operatorName, newMentions, runId));

    for (const s of scored) {
      await db
        .update(repRedditMentions)
        .set({ sentiment: s.sentiment, flagged: s.flagged, flagReason: s.flagReason })
        .where(eq(repRedditMentions.externalMentionId, s.externalMentionId));
    }

    const flaggedCount = scored.filter((s) => s.flagged).length;
    await logStep(runId, {
      phase: "reddit_watch",
      status: "success",
      detail: `${newMentions.length} new mention(s)${flaggedCount > 0 ? `, ${flaggedCount} flagged` : ""}.`,
    });
    summary.whatWorked.push(`Found ${newMentions.length} new mention(s) since last check.`);
    if (flaggedCount > 0) summary.decisionsMade.push(`${flaggedCount} mention(s) flagged for review.`);

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