// src/features/reputation-manager/server/web-watch-service.ts
//
// The three Outscraper-backed watches, one shared shape (same as the
// Trustpilot watch): fetch what's new, drop what's already on file, score
// the rest in one Claude call, insert already-scored rows and their audit
// events in one transaction.
//
//   rep-google-reviews-watch  new reviews on the client's own Google listing
//   rep-news-watch            Google News articles naming the client
//   rep-search-watch          new pages on Google's first page for the
//                             client's name next to reviews / scam / complaints
//
// News and search results can be about someone else with the same name,
// so their scoring pass also decides whether each item is about this
// client; items that aren't are dropped, never stored.

import { and, desc, eq, inArray } from "drizzle-orm";
import { labelReviews } from "./review-labels";
import type { GetStepTools, Inngest } from "inngest";
import { db } from "@/lib/db";
import { callClaude } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import { repIdentityGraphs, repWebFindings, type RepFindingSentiment, type RepWebFindingSource } from "@/models/schema";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";
import { logAuditEventsBatch, type RepAuditEvent } from "@/features/reputation-manager/server/audit-log";
import { fetchGoogleReviews, searchGoogle, searchNews, type WebResult } from "./outscraper-google";

type StepTools = GetStepTools<Inngest.Any>;
type Graph = typeof repIdentityGraphs.$inferSelect;

export interface WebItem {
  externalId: string;
  title?: string | null;
  text: string;
  url?: string | null;
  author?: string | null;
  rating?: number | null;
  ownerAnswered?: boolean | null;
  query?: string | null;
  position?: number | null;
  publishedAt?: string | null;
}

export interface Scored extends WebItem {
  relevant: boolean;
  sentiment: RepFindingSentiment;
  flagged: boolean;
  flagReason: string | null;
}

/** Newest Google reviews read on a first check. */
const FIRST_CHECK_REVIEWS = 30;
/** Newest Google reviews read on later checks (since the last one on file). */
const DAILY_REVIEWS = 50;
/** Names searched per run, so a long entity list can't run up the bill. */
const MAX_NAMES = 4;
export const SEARCH_RISK_WORDS = ["reviews", "scam", "complaints"] as const;

/** The names a watch searches for: the operator plus high-priority brands
 * and offerings, de-duplicated, blanks dropped. */
export function watchNames(graph: Pick<Graph, "operatorName" | "entities" | "offerings">): string[] {
  const names = [graph.operatorName, ...graph.entities.filter((e) => e.highPriority).map((e) => e.name), ...(graph.offerings ?? []).map((o) => o.name)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = n?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_NAMES);
}

/** Queries for the search-results watch: the main name next to the words
 * prospects type when they're checking a business out. */
export function searchQueries(operatorName: string): string[] {
  const name = operatorName.trim();
  return name ? SEARCH_RISK_WORDS.map((w) => `"${name}" ${w}`) : [];
}

const SOURCE_LABEL: Record<RepWebFindingSource, string> = {
  google_reviews: "Google reviews",
  news: "news articles",
  search_results: "Google search results",
};

export interface Who {
  names: string[];
  domains: string[];
}

export function whoOf(graph: Pick<Graph, "operatorName" | "operatorAliases" | "entities" | "operatorDomains">): Who {
  const names = [graph.operatorName, ...graph.operatorAliases, ...graph.entities.map((e) => e.name)].filter(Boolean);
  return { names: [...new Map(names.map((n) => [n.toLowerCase(), n])).values()].slice(0, 8), domains: graph.operatorDomains };
}

export async function scoreItems(source: RepWebFindingSource, who: Who, items: WebItem[], runId: string): Promise<Scored[]> {
  if (items.length === 0) return [];
  const checkRelevance = source !== "google_reviews";
  const fallback = (): Scored[] => items.map((i) => ({ ...i, relevant: !checkRelevance, sentiment: "neutral" as const, flagged: false, flagReason: null }));
  try {
    const names = who.names.join(", ");
    const domains = who.domains.join(", ");
    const numbered = items
      .map((it, i) => `[${i}] ${it.rating != null ? `Rating: ${it.rating}/5\n` : ""}${it.title ? `Title: ${it.title}\n` : ""}${it.url ? `URL: ${it.url}\n` : ""}Text: ${it.text.slice(0, 1200)}`)
      .join("\n\n");
    const result = await callClaude({
      model: "FAST",
      runId,
      maxTokens: 2000,
      system:
        `You score ${SOURCE_LABEL[source]} for reputation risk to a business known as: ${names}${domains ? ` (website: ${domains})` : ""}. ` +
        (checkRelevance ? "First decide if each item is actually about this business (not a different company or person with a similar name). " : "") +
        "Then classify sentiment toward the business (positive, neutral or negative), and flag it only if it raises a serious issue a human should look at: fraud or scam claims, safety or legal problems, refund or billing disputes, a pattern of complaints, or a page that would put a prospect off. A single mild low rating is not enough on its own. " +
        'Respond with ONLY a JSON array, no preamble, no markdown fences:\n[{"index": 0, "relevant": true, "sentiment": "positive"|"neutral"|"negative", "flagged": boolean, "flagReason": "one sentence, or null"}]',
      userMessage: numbered,
    });
    const parsed: { index: number; relevant?: boolean; sentiment: RepFindingSentiment; flagged: boolean; flagReason: string | null }[] = JSON.parse(
      result.text.trim().replace(/^```json\s*|\s*```$/g, "")
    );
    const byIndex = new Map(parsed.map((p) => [p.index, p]));
    return items.map((it, i) => {
      const s = byIndex.get(i);
      if (!s || !["positive", "neutral", "negative"].includes(s.sentiment)) return { ...it, relevant: !checkRelevance, sentiment: "neutral" as const, flagged: false, flagReason: null };
      return { ...it, relevant: checkRelevance ? s.relevant !== false : true, sentiment: s.sentiment, flagged: Boolean(s.flagged), flagReason: s.flagReason ?? null };
    });
  } catch {
    return fallback();
  }
}

/** Dedupe, score what's new, insert already-scored with audit events in
 * one transaction (the Trustpilot watch's design, for the same reasons). */
export async function processWebItems(
  engagementId: string,
  source: RepWebFindingSource,
  graph: Graph,
  fetched: WebItem[],
  runId: string
): Promise<{ newCount: number; flaggedCount: number; dropped: number }> {
  if (fetched.length === 0) return { newCount: 0, flaggedCount: 0, dropped: 0 };
  const unique = [...new Map(fetched.map((f) => [f.externalId, f])).values()];
  const existing = new Set(
    (
      await db
        .select({ externalId: repWebFindings.externalId })
        .from(repWebFindings)
        .where(and(eq(repWebFindings.engagementId, engagementId), eq(repWebFindings.source, source), inArray(repWebFindings.externalId, unique.map((f) => f.externalId))))
    ).map((r) => r.externalId)
  );
  const fresh = unique.filter((f) => !existing.has(f.externalId));
  if (fresh.length === 0) return { newCount: 0, flaggedCount: 0, dropped: 0 };

  const scored = await scoreItems(source, whoOf(graph), fresh, runId);
  const keep = scored.filter((s) => s.relevant);
  if (keep.length === 0) return { newCount: 0, flaggedCount: 0, dropped: scored.length };
  const labels = source === "google_reviews" ? await labelReviews(engagementId, keep.map((s) => ({ text: s.text, rating: s.rating ?? null })), runId) : null;

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(repWebFindings)
      .values(
        keep.map((s, i) => ({
          engagementId,
          source,
          labels: labels ? labels[i] : null,
          externalId: s.externalId,
          title: s.title ?? null,
          text: s.text,
          url: s.url ?? null,
          author: s.author ?? null,
          rating: s.rating ?? null,
          ownerAnswered: s.ownerAnswered ?? null,
          query: s.query ?? null,
          position: s.position ?? null,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
          sentiment: s.sentiment,
          flagged: s.flagged,
          flagReason: s.flagReason,
        }))
      )
      .onConflictDoNothing({ target: [repWebFindings.engagementId, repWebFindings.source, repWebFindings.externalId] })
      .returning({ externalId: repWebFindings.externalId });
    const ids = new Set(rows.map((r) => r.externalId));
    const done = keep.filter((s) => ids.has(s.externalId));
    if (done.length > 0) {
      await logAuditEventsBatch(
        engagementId,
        done.map(
          (s): RepAuditEvent => ({
            eventType: "detection",
            payload: {
              source,
              entityMatched: graph.operatorName,
              mentionText: `${s.rating != null ? `${s.rating}/5: ` : ""}${s.title ? `${s.title}: ` : ""}${s.text}`.slice(0, 2000),
              sentimentLabel: s.sentiment,
              threatCategory: s.flagged ? s.flagReason : null,
            },
          })
        ),
        tx
      );
    }
    return done;
  });
  return { newCount: inserted.length, flaggedCount: inserted.filter((s) => s.flagged).length, dropped: scored.length - keep.length };
}

async function loadGraph(engagementId: string): Promise<Graph | null> {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}

const toItem = (r: WebResult): WebItem => ({ externalId: r.externalId, title: r.title, text: r.text, url: r.url, query: r.query, position: r.position });

/** Runs one watch with the shared skip/log/finish handling. */
async function runWatch(
  tenant: { engagementId: string },
  runId: string,
  step: StepTools | undefined,
  source: RepWebFindingSource,
  phase: string,
  fetchItems: (graph: Graph) => Promise<{ items: WebItem[]; detail: string } | { skip: string }>
): Promise<void> {
  const summary = emptySummary();
  const engagementId = tenant.engagementId;
  const run = <T,>(id: string, fn: () => Promise<T>) => (step ? (step.run(id, fn) as Promise<T>) : fn());
  try {
    const graph = await run("load-identity-graph", () => loadGraph(engagementId));
    if (!graph || !graph.operatorName.trim()) {
      await logStep(runId, { phase, status: "skipped", detail: "No identity graph yet." });
      summary.openItems.push("Nothing to check until Identity Setup is saved.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }
    if (!resolveOutscraperConfig()) {
      await logStep(runId, { phase, status: "skipped", detail: "OUTSCRAPER_API_KEY not configured." });
      summary.openItems.push("Set OUTSCRAPER_API_KEY to start checking anything.");
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }
    const got = await run("fetch", () => fetchItems(graph));
    if ("skip" in got) {
      await logStep(runId, { phase, status: "skipped", detail: got.skip });
      summary.openItems.push(got.skip);
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }
    await logStep(runId, { phase, status: "running", detail: got.detail });
    const result = await run("process", () => processWebItems(engagementId, source, graph, got.items, runId));
    const detail =
      result.newCount === 0
        ? `Checked ${got.items.length} item(s). Nothing new${result.dropped ? ` (${result.dropped} weren't about this client)` : ""}.`
        : `${result.newCount} new${result.flaggedCount ? `, ${result.flaggedCount} flagged` : ""}${result.dropped ? `; ${result.dropped} weren't about this client` : ""}.`;
    await logStep(runId, { phase, status: "success", detail });
    summary.whatWorked.push(result.newCount ? `Found ${result.newCount} new ${SOURCE_LABEL[source]}.` : `No new ${SOURCE_LABEL[source]} since last check.`);
    if (result.flaggedCount) summary.decisionsMade.push(`${result.flaggedCount} flagged for review.`);
    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

export function runRepGoogleReviewsWatch(tenant: { engagementId: string }, runId: string, step: StepTools | undefined): Promise<void> {
  return runWatch(tenant, runId, step, "google_reviews", "google_reviews_watch", async (graph) => {
    const listing = graph.googleListing;
    if (!listing?.placeId) return { skip: "No Google listing confirmed for this client yet." };
    const [last] = await db
      .select({ publishedAt: repWebFindings.publishedAt })
      .from(repWebFindings)
      .where(and(eq(repWebFindings.engagementId, graph.engagementId), eq(repWebFindings.source, "google_reviews")))
      .orderBy(desc(repWebFindings.publishedAt))
      .limit(1);
    // Only reviews newer than the newest one on file (a day of overlap for
    // late-indexed reviews; duplicates are dropped by id).
    const cutoff = last?.publishedAt ? Math.floor(last.publishedAt.getTime() / 1000) - 86_400 : undefined;
    const { reviews } = await fetchGoogleReviews(listing.placeId, { limit: cutoff ? DAILY_REVIEWS : FIRST_CHECK_REVIEWS, cutoffUnixSeconds: cutoff });
    return {
      items: reviews.map((r) => ({ externalId: r.externalId, text: r.text, url: r.url, author: r.author, rating: r.rating, ownerAnswered: r.ownerAnswered, publishedAt: r.publishedAt })),
      detail: `Checking Google reviews for ${listing.name}.`,
    };
  });
}

export function runRepNewsWatch(tenant: { engagementId: string }, runId: string, step: StepTools | undefined): Promise<void> {
  return runWatch(tenant, runId, step, "news", "news_watch", async (graph) => {
    const names = watchNames(graph);
    if (names.length === 0) return { skip: "No name to search the news for yet." };
    const results = (await Promise.all(names.map((n) => searchNews(`"${n}"`, "w")))).flat();
    return { items: results.map(toItem), detail: `Searching Google News for: ${names.join(", ")}.` };
  });
}

export function runRepSearchWatch(tenant: { engagementId: string }, runId: string, step: StepTools | undefined): Promise<void> {
  return runWatch(tenant, runId, step, "search_results", "search_watch", async (graph) => {
    const queries = searchQueries(graph.operatorName);
    if (queries.length === 0) return { skip: "No name to search for yet." };
    const results = (await Promise.all(queries.map((q) => searchGoogle(q)))).flat();
    // A page the client owns is theirs to control, not a risk.
    const own = new Set(graph.operatorDomains.map((d) => d.replace(/^www\./, "").toLowerCase()));
    const notOwn = results.filter((r) => {
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, "").toLowerCase();
        return ![...own].some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return true;
      }
    });
    return { items: notOwn.map(toItem), detail: `Checking Google's first page for: ${queries.join(", ")}.` };
  });
}
