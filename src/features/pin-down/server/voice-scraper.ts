// src/features/pin-down/server/voice-scraper.ts
//
// The website crawl. One paid Firecrawl call per page returns the page's
// readable text (for the voice corpus and Claude's reading of the offer),
// its rendered HTML and its links (for everything site-signals.ts reads
// for free: structured data, social profiles, booking links, the tools
// the site runs, colors and fonts). Before, the homepage was paid for
// twice (text here, HTML again in design-scraper.ts) and a third time
// fetched without JavaScript for social links and booking detection, and
// only four pages could use Firecrawl at all.
import { fetchWithTimeout } from "@/lib/http";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";

export type PageKind = "marketing_site" | "about_page" | "sales_page" | "pricing_page" | "proof_page" | "faq_page" | "booking_page" | "supporting_page";

export interface ScrapedSource {
  kind: PageKind;
  url: string;
  wordCount: number;
  /** Readable text; empty when the page is thin (a bare booking embed). */
  text: string;
  /** Rendered HTML, when the page was fetched (for site-signals.ts). */
  html?: string;
  /** Every link on the page, when the crawler returned them. */
  links?: string[];
}

interface DiscoveredLink {
  url: string;
  title?: string;
  description?: string;
}

interface RankedCandidate {
  url: string;
  kind: Exclude<PageKind, "marketing_site">;
  priority: number;
}

interface FirecrawlBudget {
  used: number;
  max: number;
}

interface FetchedPage {
  text: string | null;
  html: string | null;
  links: string[];
}

const CRAWL_TIMEOUT_MS = 6000;
const FIRECRAWL_TIMEOUT_MS = 20000;
const FIRECRAWL_MAP_TIMEOUT_MS = 8000;
const MAX_CHARS_PER_PAGE = 20000;
// Rendered HTML kept per page for signal extraction. Big enough for the
// head (scripts, JSON-LD, meta) and the footer (social links).
const MAX_HTML_CHARS_PER_PAGE = 400_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// JS-built sites (Framer, Wix, React) paint after load; the homepage waits
// for them. Other pages are usually server-rendered once the site is.
const HOMEPAGE_WAIT_MS = 2500;

// A deep read, once per client: every product reuses it (discover-client.ts
// only crawls again when the domain changes).
const WORD_BUDGET_TARGET = 15000;
const MAX_PAGES_PER_CRAWL = 10;
const MAX_FIRECRAWL_SCRAPE_CALLS = 10;
const FETCH_BATCH_SIZE = 4;
const CRAWL_BUDGET_MS = 45000;

const SALES_STATIC_PATHS = ["/sales", "/offer", "/work-with-us", "/apply", "/get-started", "/services", "/program"];
const ABOUT_STATIC_PATHS = ["/about", "/about-us", "/our-story", "/team"];
const PROOF_STATIC_PATHS = ["/case-studies", "/results", "/testimonials", "/success-stories", "/reviews"];
const PRICING_STATIC_PATHS = ["/pricing", "/plans", "/packages"];
const FAQ_STATIC_PATHS = ["/faq", "/faqs"];
const BOOKING_STATIC_PATHS = ["/book", "/book-a-call", "/schedule", "/call", "/strategy-call"];

// ── Content Quality Gate ─────────────────────────────────────────────────

/**
 * Prevents nav bars, footers, cookie banners, and Cloudflare challenge
 * pages from being mistaken for real marketing copy. Applied to BOTH
 * Firecrawl output (which is usually clean but can fail) and direct
 * fetch output (which is frequently noisy).
 */
function looksLikeRealContent(text: string): boolean {
  const words = text.split(/\s+/);
  if (words.length < 30) return false;

  // Real prose has longer average word length than "Home About Blog Contact"
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  if (avgWordLength < 3.5) return false;

  // High concentration of navigation / legal signal words = not content
  const noiseSignals = [
    /\b(privacy|terms?\s?(?:of\s?service)?|cookie|gdpr|ccpa|copyright|all rights reserved|powered by)\b/i,
    /\b(log\s?in|sign\s?(?:up|in)|register|sitemap)\b/i,
  ];

  const signalCount = noiseSignals.reduce((count, regex) => {
    const matches = text.match(regex);
    return count + (matches ? matches.length : 0);
  }, 0);

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 0 && signalCount / sentences.length > 0.15) {
    return false;
  }

  // Navigation links are very short lines; paragraphs are not
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const shortLines = lines.filter((l) => l.trim().split(/\s+/).length <= 3).length;
  if (lines.length > 0 && shortLines / lines.length > 0.6) {
    return false;
  }

  return true;
}

// ── HTML Cleaning & Parsing ─────────────────────────────────────────────

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  return d;
}

// ── Fallback: direct HTTP fetch (free, no JavaScript) ────────────────────

async function fetchPageDirect(url: string): Promise<FetchedPage | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    return { text: htmlToText(html).slice(0, MAX_CHARS_PER_PAGE), html: html.slice(0, MAX_HTML_CHARS_PER_PAGE), links: [] };
  } catch {
    return null;
  }
}

// ── Primary: Firecrawl /v2/scrape, one call per page ────────────────────

async function fetchPageViaFirecrawl(url: string, budget: FirecrawlBudget, deadline: number, opts: { waitFor?: number } = {}): Promise<FetchedPage | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || budget.used >= budget.max) return null;
  if (Date.now() >= deadline) return null;

  budget.used += 1; // Reserve synchronously before await

  try {
    const remaining = deadline - Date.now();
    const res = await fetchWithTimeout(
      "https://api.firecrawl.dev/v2/scrape",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url,
          // Text for reading, raw HTML and links for the free signals, in
          // the same call. (No "json" format: our own Claude + Jev pass
          // does the structured reading.)
          formats: ["markdown", "rawHtml", "links"],
          // Readable text without nav and footer; rawHtml is the page as
          // served either way, so footer links and scripts survive.
          onlyMainContent: true,
          ...(opts.waitFor ? { waitFor: opts.waitFor } : {}),
          // Firecrawl stops the job when we would stop waiting anyway.
          timeout: Math.max(1000, Math.min(FIRECRAWL_TIMEOUT_MS, remaining)),
        }),
      },
      Math.min(FIRECRAWL_TIMEOUT_MS, remaining)
    );
    if (!res.ok) return null;
    const data = await res.json();
    const markdown: string | undefined = data?.data?.markdown;
    const rawHtml: string | undefined = data?.data?.rawHtml;
    const links: unknown = data?.data?.links;
    if (!markdown && !rawHtml) return null;
    return {
      text: markdown ? markdown.slice(0, MAX_CHARS_PER_PAGE) : null,
      html: rawHtml ? rawHtml.slice(0, MAX_HTML_CHARS_PER_PAGE) : null,
      links: Array.isArray(links) ? links.filter((l): l is string => typeof l === "string") : [],
    };
  } catch {
    return null;
  }
}

// ── Unified fetch with quality gate ──────────────────────────────────────

/**
 * Firecrawl first (rendered, clean text, links), a free direct fetch when
 * Firecrawl fails, is unconfigured, or the budget is spent. The text goes
 * through looksLikeRealContent() so nav bars and challenge pages never
 * reach Claude as copy; the HTML is kept either way, because a thin page
 * (a booking page that's just a Calendly embed) still carries signals.
 */
async function fetchPageWithFallback(url: string, deadline: number, firecrawlBudget: FirecrawlBudget, opts: { waitFor?: number } = {}): Promise<FetchedPage | null> {
  if (Date.now() >= deadline) return null;

  let page: FetchedPage | null = null;
  if (firecrawlBudget.used < firecrawlBudget.max && process.env.FIRECRAWL_API_KEY) {
    page = await fetchPageViaFirecrawl(url, firecrawlBudget, deadline, opts);
  }
  if ((!page || !page.html || !page.text || !looksLikeRealContent(page.text)) && Date.now() < deadline) {
    const direct = await fetchPageDirect(url);
    if (direct) {
      page = {
        text: page?.text && looksLikeRealContent(page.text) ? page.text : direct.text,
        html: page?.html ?? direct.html,
        links: page?.links?.length ? page.links : direct.links,
      };
    }
  }
  if (!page) return null;
  return { ...page, text: page.text && looksLikeRealContent(page.text) ? page.text : null };
}

// ── AI Link Classification Engine ──────────────────────────────────────────

const PAGE_KINDS = ["sales_page", "about_page", "proof_page", "pricing_page", "faq_page", "booking_page", "supporting_page"] as const;

async function classifySiteLinksWithAI(
  links: DiscoveredLink[],
  runId?: string
): Promise<RankedCandidate[]> {
  if (links.length === 0) return [];

  const linkPayload = links.slice(0, 150).map((l) => ({
    url: l.url,
    title: l.title || "",
    description: l.description || "",
  }));

  const system = `You pick which pages of a business's website to read, to learn its offer, prices, proof, brand voice and how people book.
Choose up to 9 pages. Always include, when they exist: the pricing page, the main offer or sales page, the about/founder page, the testimonials or case studies page, the FAQ page, and the booking or "book a call" page. Skip blog posts, legal pages, logins, carts, tag and author archives.

Categories:
- "sales_page": main offer, VSL, work-with-us, application, services
- "about_page": founder story, team, mission
- "proof_page": case studies, results, testimonials, reviews
- "pricing_page": pricing, plans, packages
- "faq_page": FAQ, common questions
- "booking_page": book a call, schedule, calendar
- "supporting_page": how it works, other offers
- "ignore": everything else

Return ONLY a JSON array: [{ "url": "string", "kind": "one of the categories", "priority": 1-3 }]`;

  try {
    const res = await callClaudeWithRetry({
      model: MODEL.SYNTHESIS,
      system,
      userMessage: `Categorize these links:\n${JSON.stringify(linkPayload)}`,
      maxTokens: 1400,
      runId,
    });

    const jsonMatch = res.text.match(/\[[\s\S]*\]/);
    const rawJson = jsonMatch ? jsonMatch[0] : res.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(rawJson);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: { url?: unknown; kind?: unknown }) => typeof item.url === "string" && PAGE_KINDS.includes(item.kind as (typeof PAGE_KINDS)[number]))
      .map((item: { url: string; kind: RankedCandidate["kind"]; priority?: unknown }) => ({
        url: item.url,
        kind: item.kind,
        priority: typeof item.priority === "number" ? item.priority : 2,
      }));
  } catch {
    return [];
  }
}

function staticFallbackCandidates(base: string): RankedCandidate[] {
  const make = (paths: string[], kind: RankedCandidate["kind"], priority: number): RankedCandidate[] =>
    paths.map((p) => ({ url: `${base}${p}`, kind, priority }));

  return [
    ...make(PRICING_STATIC_PATHS, "pricing_page", 1),
    ...make(SALES_STATIC_PATHS, "sales_page", 1),
    ...make(ABOUT_STATIC_PATHS, "about_page", 1),
    ...make(PROOF_STATIC_PATHS, "proof_page", 1),
    ...make(FAQ_STATIC_PATHS, "faq_page", 2),
    ...make(BOOKING_STATIC_PATHS, "booking_page", 2),
  ];
}

async function discoverCandidateUrls(
  base: string,
  deadline: number,
  runId?: string
): Promise<RankedCandidate[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const remaining = deadline - Date.now();
  if (!apiKey || remaining < 2000) return staticFallbackCandidates(base);

  try {
    const res = await fetchWithTimeout(
      "https://api.firecrawl.dev/v2/map",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: base, limit: 200 }),
      },
      Math.min(FIRECRAWL_MAP_TIMEOUT_MS, remaining - 1000)
    );
    if (!res.ok) return staticFallbackCandidates(base);
    const data = await res.json();
    const rawLinks: unknown[] = data?.links ?? [];
    if (rawLinks.length === 0) return staticFallbackCandidates(base);

    const links: DiscoveredLink[] = rawLinks
      .map((l) =>
        typeof l === "string" ? { url: l } : { url: (l as DiscoveredLink)?.url, title: (l as DiscoveredLink)?.title, description: (l as DiscoveredLink)?.description }
      )
      .filter((l): l is DiscoveredLink => typeof l.url === "string" && Boolean(l.url));

    if (links.length === 0) return staticFallbackCandidates(base);

    const aiRanked = await classifySiteLinksWithAI(links, runId);
    if (aiRanked.length > 0) return aiRanked;

    return staticFallbackCandidates(base);
  } catch {
    return staticFallbackCandidates(base);
  }
}

// ── The crawl ────────────────────────────────────────────────────────────

export interface SiteCrawl {
  /** Readable text of every page with real copy, for voice and reading. */
  corpus: string;
  sources: ScrapedSource[];
  /** The homepage's rendered HTML, for design and signals. */
  homepageHtml: string | null;
}

export async function crawlSite(domain: string, runId?: string): Promise<SiteCrawl> {
  const base = normalizeDomain(domain);
  const sources: ScrapedSource[] = [];
  const deadline = Date.now() + CRAWL_BUDGET_MS;
  const firecrawlBudget: FirecrawlBudget = { used: 0, max: MAX_FIRECRAWL_SCRAPE_CALLS };
  let totalWords = 0;

  // 1. Homepage (waits for JS-built sites) and page discovery, in parallel.
  const [homepage, discovered] = await Promise.all([
    fetchPageWithFallback(base, deadline, firecrawlBudget, { waitFor: HOMEPAGE_WAIT_MS }),
    discoverCandidateUrls(base, deadline, runId),
  ]);
  if (homepage) {
    const wc = homepage.text ? homepage.text.split(/\s+/).length : 0;
    sources.push({ kind: "marketing_site", url: base, wordCount: wc, text: homepage.text ?? "", html: homepage.html ?? undefined, links: homepage.links });
    totalWords += wc;
  }

  // 2. The chosen pages, most important first, in parallel batches.
  const rankedCandidates = discovered
    .filter((c) => c.url.replace(/\/+$/, "") !== base)
    .sort((a, b) => a.priority - b.priority || a.url.length - b.url.length);
  const usedUrls = new Set<string>([base]);

  for (let i = 0; i < rankedCandidates.length; i += FETCH_BATCH_SIZE) {
    if (sources.length >= MAX_PAGES_PER_CRAWL || totalWords >= WORD_BUDGET_TARGET || Date.now() >= deadline) break;

    const batch = rankedCandidates.slice(i, i + FETCH_BATCH_SIZE).filter((c) => !usedUrls.has(c.url));
    if (batch.length === 0) continue;
    batch.forEach((c) => usedUrls.add(c.url));

    const results = await Promise.allSettled(
      batch.map(async (c): Promise<ScrapedSource | null> => {
        const page = await fetchPageWithFallback(c.url, deadline, firecrawlBudget);
        if (!page) return null;
        const wc = page.text ? page.text.split(/\s+/).length : 0;
        // A thin page still counts when its HTML carries signals (a
        // booking page that's just an embed).
        if (wc <= 30 && !(c.kind === "booking_page" && page.html)) return null;
        return { kind: c.kind, url: c.url, wordCount: wc, text: wc > 30 ? page.text! : "", html: page.html ?? undefined, links: page.links };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        sources.push(r.value);
        totalWords += r.value.wordCount;
      }
    }
  }

  const corpus = sources
    .filter((s) => s.text)
    .map((s) => `[${s.kind} ${s.url}]\n${s.text}`)
    .join("\n\n---\n\n");
  return { corpus, sources, homepageHtml: homepage?.html ?? null };
}

/** The crawl as the voice pipeline has always used it. */
export async function scrapeVoiceCorpus(
  domain: string,
  runId?: string
): Promise<{
  corpus: string;
  sources: ScrapedSource[];
}> {
  const { corpus, sources } = await crawlSite(domain, runId);
  return { corpus, sources };
}

// ── Multi-ESP Broadcast Scraper ─────────────────────────────────────────

async function scrapeKlaviyoBroadcasts(apiKey: string): Promise<{ text: string; wordCount: number }[]> {
  const listRes = await fetchWithTimeout(
    "https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')&sort=-created_at&page[size]=3",
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-10-15",
        accept: "application/json",
      },
    }
  );
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const campaignIds: string[] = (listData.data ?? []).slice(0, 3).map((c: any) => c.id);

  const results: { text: string; wordCount: number }[] = [];
  for (const id of campaignIds) {
    const msgRes = await fetchWithTimeout(`https://a.klaviyo.com/api/campaigns/${id}/campaign-messages/`, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-10-15",
        accept: "application/json",
      },
    });
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json();
    const html: string | undefined = msgData.data?.[0]?.attributes?.content?.body;
    if (html) {
      const text = htmlToText(html).slice(0, MAX_CHARS_PER_PAGE);
      if (text.split(/\s+/).length > 20) results.push({ text, wordCount: text.split(/\s+/).length });
    }
  }
  return results;
}

async function scrapeMailchimpBroadcasts(apiKey: string): Promise<{ text: string; wordCount: number }[]> {
  const dc = apiKey.includes("-") ? apiKey.slice(apiKey.lastIndexOf("-") + 1) : "";
  if (!dc) return [];
  const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

  const listRes = await fetchWithTimeout(
    `https://${dc}.api.mailchimp.com/3.0/campaigns?type=regular&status=sent&sort_field=send_time&sort_dir=DESC&count=3`,
    { headers: { Authorization: authHeader } }
  );
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const campaignIds: string[] = (listData.campaigns ?? []).slice(0, 3).map((c: any) => c.id).filter(Boolean);

  const results: { text: string; wordCount: number }[] = [];
  for (const id of campaignIds) {
    const contentRes = await fetchWithTimeout(`https://${dc}.api.mailchimp.com/3.0/campaigns/${id}/content`, {
      headers: { Authorization: authHeader },
    });
    if (!contentRes.ok) continue;
    const contentData = await contentRes.json();
    const html: string | undefined = contentData.html || contentData.plain_text;
    if (html) {
      const text = htmlToText(html).slice(0, MAX_CHARS_PER_PAGE);
      if (text.split(/\s+/).length > 20) results.push({ text, wordCount: text.split(/\s+/).length });
    }
  }
  return results;
}

async function scrapeActiveCampaignBroadcasts(
  baseUrl: string,
  apiKey: string
): Promise<{ text: string; wordCount: number }[]> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const headers = { "Api-Token": apiKey, "Content-Type": "application/json" };

  const listRes = await fetchWithTimeout(`${cleanBase}/campaigns?orders[sdate]=DESC&limit=3`, { headers });
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const campaignIds: string[] = (listData.campaigns ?? []).slice(0, 3).map((c: any) => c.id).filter(Boolean);

  const results: { text: string; wordCount: number }[] = [];
  for (const id of campaignIds) {
    const msgRes = await fetchWithTimeout(`${cleanBase}/campaigns/${id}/messages`, { headers });
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json();
    const first = (msgData.campaignMessages ?? msgData.messages ?? [])[0];
    const html: string | undefined = first?.message?.html ?? first?.html;
    if (html) {
      const text = htmlToText(html).slice(0, MAX_CHARS_PER_PAGE);
      if (text.split(/\s+/).length > 20) results.push({ text, wordCount: text.split(/\s+/).length });
    }
  }
  return results;
}

async function scrapeGhlBroadcasts(
  locationId: string,
  apiKey: string
): Promise<{ text: string; wordCount: number }[]> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };

  const listRes = await fetchWithTimeout(
    `https://services.leadconnectorhq.com/emails/public/v2/locations/${locationId}/campaigns/emails?limit=3`,
    { headers }
  );
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const campaigns: any[] = listData.campaigns ?? listData.data ?? [];

  const results: { text: string; wordCount: number }[] = [];
  for (const campaign of campaigns.slice(0, 3)) {
    const id = campaign.id ?? campaign._id;
    if (!id) continue;
    const detailRes = await fetchWithTimeout(
      `https://services.leadconnectorhq.com/emails/public/v2/locations/${locationId}/campaigns/emails/${id}`,
      { headers }
    );
    if (!detailRes.ok) continue;
    const detail = await detailRes.json();
    const html: string | undefined = detail.html ?? detail.body ?? detail.campaign?.html;
    if (html) {
      const text = htmlToText(html).slice(0, MAX_CHARS_PER_PAGE);
      if (text.split(/\s+/).length > 20) results.push({ text, wordCount: text.split(/\s+/).length });
    }
  }
  return results;
}

export async function scrapeEspBroadcasts(
  emailPlatform: string | undefined,
  apiKey: string | undefined,
  meta?: { activecampaignBaseUrl?: string; ghlLocationId?: string }
): Promise<{ text: string; wordCount: number }[]> {
  if (!emailPlatform || !apiKey) return [];

  try {
    switch (emailPlatform) {
      case "klaviyo":
        return await scrapeKlaviyoBroadcasts(apiKey);
      case "mailchimp":
        return await scrapeMailchimpBroadcasts(apiKey);
      case "activecampaign":
        if (!meta?.activecampaignBaseUrl) return [];
        return await scrapeActiveCampaignBroadcasts(meta.activecampaignBaseUrl, apiKey);
      case "ghl":
        if (!meta?.ghlLocationId) return [];
        return await scrapeGhlBroadcasts(meta.ghlLocationId, apiKey);
      default:
        return [];
    }
  } catch (e: any) {
    console.warn(`[voice-scraper] ESP broadcast pull failed for ${emailPlatform} (non-fatal):`, e.message);
    return [];
  }
}