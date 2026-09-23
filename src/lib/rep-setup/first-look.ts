// src/lib/rep-setup/first-look.ts
//
// A small, one-time look at where this client's reputation stands right
// now, run during setup so the review opens with real numbers instead of
// an empty form: the Google listing's rating and unanswered bad reviews,
// the Trustpilot baseline already on file, Reddit and X mentions from the
// last month, news from the last month, Google's first page for
// "{name} reviews", and what each AI engine says when asked.
//
// Kept deliberately small (per-result billing): 20 newest Google reviews,
// one news search, one web search, one question per AI engine. Parts that
// can't run (no key, a failed call) are listed as skipped, never guessed.
// Nothing here is stored as findings: the daily watches own that.

import type { RepEngineId, RepGoogleListing } from "@/models/schema";
import { upsertClientFact, getClientFact } from "@/lib/client-facts";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";
import { resolveRedditApiKey } from "@/features/reputation-manager/reddit-config";
import { resolveTwitterApiKey } from "@/features/reputation-manager/twitter-config";
import { fetchGoogleReviews, searchGoogle, searchNews } from "@/features/reputation-manager/server/outscraper-google";
import { fetchRedditMentions } from "@/features/reputation-manager/server/reddit-watch-service";
import { fetchTwitterMentions } from "@/features/reputation-manager/server/twitter-watch-service";
import { queryEngine } from "@/features/reputation-manager/server/engine-panel-service";
import { scoreItems, type Who, type WebItem } from "@/features/reputation-manager/server/web-watch-service";
import { REP_ENGINE_IDS, REP_ENGINE_LABELS, resolveEngineModel } from "@/features/reputation-manager/engine-models";
import type { FirstLook } from "./types";

const MONTH_MS = 30 * 86_400_000;
const GOOGLE_REVIEWS = 20;

async function settle<T>(label: string, skipped: string[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[rep-setup/first-look] ${label} failed:`, err instanceof Error ? err.message : err);
    skipped.push(label);
    return null;
  }
}

const recent = (iso: string | null | undefined, now: number) => (iso ? now - new Date(iso).getTime() <= MONTH_MS : false);

export async function runFirstLook(opts: {
  engagementId: string;
  runId: string;
  who: Who;
  listing: RepGoogleListing | null;
  prompt: string | null;
  engines: RepEngineId[] | null;
}): Promise<FirstLook> {
  const now = Date.now();
  const skipped: string[] = [];
  const name = opts.who.names[0] ?? "";
  const outscraper = Boolean(resolveOutscraperConfig());

  const google = opts.listing && outscraper
    ? settle("Google reviews", skipped, async () => {
        const { listing, reviews } = await fetchGoogleReviews(opts.listing!.placeId, { limit: GOOGLE_REVIEWS });
        const l = listing ?? opts.listing!;
        const negative = reviews.filter((r) => r.rating <= 2);
        return {
          rating: l.rating ?? null,
          reviews: l.reviews ?? null,
          oneStar: l.reviewsPerScore?.["1"] ?? null,
          unansweredNegative: negative.filter((r) => !r.ownerAnswered).length,
          recentNegative: negative.slice(0, 3).map((r) => ({ text: r.text.slice(0, 280), rating: r.rating, url: r.url })),
        };
      })
    : (opts.listing ? skipped.push("Google reviews (no Outscraper key)") : null, Promise.resolve(null));

  const reddit = resolveRedditApiKey() && name
    ? settle("Reddit", skipped, async () => (await fetchRedditMentions([name])).filter((m) => recent(m.publishedAt, now)))
    : (skipped.push("Reddit (no key)"), Promise.resolve(null));
  const x = resolveTwitterApiKey() && name
    ? settle("X", skipped, async () => (await fetchTwitterMentions([name])).filter((m) => recent(m.publishedAt, now)))
    : (skipped.push("X (no key)"), Promise.resolve(null));
  const news = outscraper && name ? settle("News", skipped, () => searchNews(`"${name}"`, "m")) : Promise.resolve(null);
  const searchQuery = name ? `"${name}" reviews` : "";
  const search = outscraper && name ? settle("Google search", skipped, () => searchGoogle(searchQuery)) : Promise.resolve(null);

  const engineIds = (opts.engines ?? REP_ENGINE_IDS).filter((e) => Boolean(resolveEngineModel(e)));
  const engines = opts.prompt && engineIds.length
    ? settle("AI engines", skipped, async () => {
        const answers = await Promise.all(engineIds.map((e) => queryEngine(e, name, opts.prompt!, opts.runId)));
        return answers.filter((a): a is { engineId: RepEngineId; promptText: string; responseText: string } => !("error" in a));
      })
    : Promise.resolve(null);

  const [g, r, t, n, s, e] = await Promise.all([google, reddit, x, news, search, engines]);

  // One scoring pass per kind over what came back (sentiment, and for news
  // and search whether it's even about this client).
  const [redditScored, xScored, newsScored, searchScored, engineScored] = await Promise.all([
    r?.length ? scoreItems("news", opts.who, r.slice(0, 25).map((m) => ({ externalId: m.externalMentionId, text: m.mentionText, url: m.permalink })), opts.runId) : [],
    t?.length ? scoreItems("news", opts.who, t.slice(0, 25).map((m) => ({ externalId: m.externalMentionId, text: m.mentionText, url: m.permalink })), opts.runId) : [],
    n?.length ? scoreItems("news", opts.who, n.slice(0, 15).map((a): WebItem => ({ externalId: a.externalId, title: a.title, text: a.text, url: a.url })), opts.runId) : [],
    s?.length ? scoreItems("search_results", opts.who, s.slice(0, 10).map((a): WebItem => ({ externalId: a.externalId, title: a.title, text: a.text, url: a.url, position: a.position })), opts.runId) : [],
    e?.length ? scoreItems("news", opts.who, e.map((a) => ({ externalId: a.engineId, title: `${REP_ENGINE_LABELS[a.engineId]} on "${a.promptText}"`, text: a.responseText.slice(0, 1500) })), opts.runId) : [],
  ]);
  const aboutThem = <T extends { relevant: boolean }>(xs: T[]) => xs.filter((i) => i.relevant);

  const look: FirstLook = {
    at: new Date(now).toISOString(),
    google: g,
    trustpilot: await trustpilotBaseline(opts.engagementId),
    reddit: r ? { mentions: redditScored.length ? aboutThem(redditScored).length : r.length, negative: aboutThem(redditScored).filter((i) => i.sentiment === "negative").length } : null,
    x: t ? { mentions: xScored.length ? aboutThem(xScored).length : t.length, negative: aboutThem(xScored).filter((i) => i.sentiment === "negative").length } : null,
    news: n
      ? {
          articles: aboutThem(newsScored).length,
          negative: aboutThem(newsScored).filter((i) => i.sentiment === "negative").length,
          top: aboutThem(newsScored).slice(0, 3).map((i) => ({ title: i.title ?? i.text.slice(0, 90), url: i.url ?? "" })),
        }
      : null,
    search: s
      ? {
          query: searchQuery,
          results: searchScored.slice(0, 8).map((i) => ({ title: i.title ?? i.url ?? "", url: i.url ?? "", position: i.position ?? 0, risky: i.relevant && (i.flagged || i.sentiment === "negative") })),
        }
      : null,
    engines: engineScored.map((i) => ({ engine: REP_ENGINE_LABELS[i.externalId as RepEngineId] ?? i.externalId, sentiment: i.sentiment, excerpt: i.text.slice(0, 220), flagged: i.flagged })),
    skipped,
  };

  await upsertClientFact(opts.engagementId, "repFirstLook", look, { source: "account", sourceDetail: "repSetup", evidence: "A one-time look at the client's reputation during setup." });
  return look;
}

async function trustpilotBaseline(engagementId: string): Promise<FirstLook["trustpilot"]> {
  const f = await getClientFact(engagementId, "reviewBaseline");
  const v = f && f.status !== "rejected" ? (f.value as { platform?: string; rating?: number; reviewCount?: number }) : null;
  return v && (v.platform ?? "trustpilot") === "trustpilot" && (v.rating != null || v.reviewCount != null) ? { rating: v.rating ?? null, reviews: v.reviewCount ?? null } : null;
}
