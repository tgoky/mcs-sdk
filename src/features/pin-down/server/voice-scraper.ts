import { fetchWithTimeout } from "@/lib/http";
import { callClaudeWithRetry, MODEL } from "@/lib/llm";

interface ScrapedSource {
  kind: "marketing_site" | "about_page" | "sales_page" | "pricing_page" | "proof_page" | "supporting_page";
  url: string;
  wordCount: number;
  text: string;
}

interface DiscoveredLink {
  url: string;
  title?: string;
  description?: string;
}

interface RankedCandidate {
  url: string;
  kind: "about_page" | "sales_page" | "pricing_page" | "proof_page" | "supporting_page";
  priority: number; // 1 = highest value for voice extraction, 3 = lowest
}

interface FirecrawlBudget {
  used: number;
  max: number;
}

const CRAWL_TIMEOUT_MS = 8000;
const FIRECRAWL_TIMEOUT_MS = 15000; // JS-rendered scrapes are slower
const FIRECRAWL_MAP_TIMEOUT_MS = 6000;
const MAX_CHARS_PER_PAGE = 12000;
const USER_AGENT = "ShowtimePinDownVoiceCrawler/1.0 (+https://mcs-abra.vercel.app)";
const THIN_PAGE_WORD_THRESHOLD = 20;

/**
 * Stop walking ranked candidate pages once the combined corpus hits this word target.
 */
const WORD_BUDGET_TARGET = 5000;

/**
 * Hard ceiling on total pages fetched per crawl (homepage included).
 */
const MAX_PAGES_PER_CRAWL = 8;

/**
 * Hard ceiling on Firecrawl /v2/scrape (Tier 2) calls per crawl to prevent credit burn.
 */
const MAX_FIRECRAWL_SCRAPE_CALLS = 4;

/**
 * Number of candidate pages fetched concurrently in parallel.
 */
const FETCH_BATCH_SIZE = 3;

/**
 * Hard wall-clock ceiling for the ENTIRE scrapeVoiceCorpus() execution.
 */
const CRAWL_BUDGET_MS = 20000;

// Static fallback paths used only when Firecrawl /v2/map or AI classification is unavailable
const SALES_STATIC_PATHS = ["/sales", "/sale", "/offer", "/work-with-us", "/apply", "/get-started"];
const ABOUT_STATIC_PATHS = ["/about", "/about-us", "/our-story", "/story", "/mission", "/manifesto"];
const PROOF_STATIC_PATHS = ["/case-studies", "/results", "/testimonials", "/success-stories"];
const PRICING_STATIC_PATHS = ["/pricing", "/plans", "/packages"];

// ── HTML Cleaning & Parsing ─────────────────────────────────────────────

function htmlToText(html: string): string {
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

async function fetchPageText(url: string): Promise<string | null> {
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
    return htmlToText(html).slice(0, MAX_CHARS_PER_PAGE);
  } catch {
    return null;
  }
}

/**
 * Tier 2: Firecrawl's /v2/scrape endpoint for JS-heavy apps or Cloudflare-protected pages.
 */
async function fetchPageTextViaFirecrawl(url: string, budget: FirecrawlBudget): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || budget.used >= budget.max) return null;
  budget.used += 1; // Synchronously reserved before await

  try {
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
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      },
      FIRECRAWL_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const markdown: string | undefined = data?.data?.markdown;
    if (!markdown) return null;
    return markdown.slice(0, MAX_CHARS_PER_PAGE);
  } catch {
    return null;
  }
}

async function fetchPageTextWithFallback(
  url: string,
  deadline: number,
  firecrawlBudget: FirecrawlBudget
): Promise<string | null> {
  if (Date.now() >= deadline) return null;

  const direct = await fetchPageText(url);
  if (direct && direct.split(/\s+/).length >= THIN_PAGE_WORD_THRESHOLD) {
    return direct;
  }

  if (Date.now() >= deadline) return null;
  return fetchPageTextViaFirecrawl(url, firecrawlBudget);
}

// ── AI Link Classification Engine ──────────────────────────────────────────

/**
 * Uses Claude (Haiku / fast LLM) to analyze the raw link inventory returned by Firecrawl /v2/map.
 * Replaces dumb keyword matching with semantic intent classification.
 */
async function classifySiteLinksWithAI(
  links: DiscoveredLink[],
  runId?: string
): Promise<RankedCandidate[]> {
  if (links.length === 0) return [];

  const linkPayload = links.slice(0, 100).map((l) => ({
    url: l.url,
    title: l.title || "",
    description: l.description || "",
  }));

  const system = `You are an expert Web Crawling Agent for brand voice analysis. 
Analyze the provided website links and identify up to 8 pages that carry the highest concentration of the founder's authentic voice, core offer positioning, philosophy, and customer proof.

Categories to assign:
- "sales_page": Primary sales page, main VSL, core offer, work-with-us, application
- "about_page": Founder story, manifesto, mission, philosophy, origin story, who we are
- "proof_page": Case studies, client results, testimonials, reviews
- "pricing_page": Pricing plans, packages, tiers
- "supporting_page": Services breakdown, how it works, FAQs
- "ignore": Privacy policy, terms, login, cart, generic blog posts, author archives

Return ONLY a JSON array of objects:
[
  { "url": "string", "kind": "sales_page|about_page|proof_page|pricing_page|supporting_page", "priority": 1-3 }
]`;

  try {
    const res = await callClaudeWithRetry({
      model: MODEL.SYNTHESIS,
      system,
      userMessage: `Categorize these links:\n${JSON.stringify(linkPayload)}`,
      maxTokens: 1200,
      runId,
    });

    const cleaned = res.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: any) =>
          item.url &&
          item.kind &&
          item.kind !== "ignore" &&
          ["sales_page", "about_page", "proof_page", "pricing_page", "supporting_page"].includes(item.kind)
      )
      .map((item: any) => ({
        url: item.url,
        kind: item.kind,
        priority: typeof item.priority === "number" ? item.priority : 2,
      }));
  } catch {
    return []; // Soft-fail back to static path guesses on parse failure
  }
}

function staticFallbackCandidates(base: string): RankedCandidate[] {
  const make = (paths: string[], kind: RankedCandidate["kind"], priority: number): RankedCandidate[] =>
    paths.map((p) => ({ url: `${base}${p}`, kind, priority }));

  return [
    ...make(SALES_STATIC_PATHS, "sales_page", 1),
    ...make(ABOUT_STATIC_PATHS, "about_page", 1),
    ...make(PROOF_STATIC_PATHS, "proof_page", 2),
    ...make(PRICING_STATIC_PATHS, "pricing_page", 2),
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
        body: JSON.stringify({ url: base, limit: 150 }),
      },
      Math.min(FIRECRAWL_MAP_TIMEOUT_MS, remaining - 1000)
    );
    if (!res.ok) return staticFallbackCandidates(base);
    const data = await res.json();
    const links: DiscoveredLink[] = data?.links ?? [];
    if (links.length === 0) return staticFallbackCandidates(base);

    // AI Semantic Pass: Claude classifies Firecrawl's indexed links
    const aiRanked = await classifySiteLinksWithAI(links, runId);
    if (aiRanked.length > 0) return aiRanked;

    return staticFallbackCandidates(base);
  } catch {
    return staticFallbackCandidates(base);
  }
}

// ── Main Web Scraper Function ───────────────────────────────────────────

export async function scrapeVoiceCorpus(
  domain: string,
  runId?: string
): Promise<{
  corpus: string;
  sources: ScrapedSource[];
}> {
  const base = normalizeDomain(domain);
  const sources: ScrapedSource[] = [];
  const deadline = Date.now() + CRAWL_BUDGET_MS;
  const firecrawlBudget: FirecrawlBudget = { used: 0, max: MAX_FIRECRAWL_SCRAPE_CALLS };
  let totalWords = 0;

  // 1. Fetch Homepage
  const homepageText = await fetchPageTextWithFallback(base, deadline, firecrawlBudget);
  if (homepageText) {
    const wc = homepageText.split(/\s+/).length;
    if (wc > 20) {
      sources.push({ kind: "marketing_site", url: base, wordCount: wc, text: homepageText });
      totalWords += wc;
    }
  }

  // 2. Discover & Classify Candidates with AI
  const discovered = await discoverCandidateUrls(base, deadline, runId);
  const rankedCandidates = discovered
    .filter((c) => c.url !== base)
    .sort((a, b) => a.priority - b.priority || a.url.length - b.url.length);

  const usedUrls = new Set<string>([base]);

  // 3. Batched Parallel Crawl Walk
  for (let i = 0; i < rankedCandidates.length; i += FETCH_BATCH_SIZE) {
    if (sources.length >= MAX_PAGES_PER_CRAWL || totalWords >= WORD_BUDGET_TARGET || Date.now() >= deadline) {
      break;
    }

    const batch = rankedCandidates.slice(i, i + FETCH_BATCH_SIZE).filter((c) => !usedUrls.has(c.url));
    if (batch.length === 0) continue;
    batch.forEach((c) => usedUrls.add(c.url));

    const results = await Promise.allSettled(
      batch.map(async (c): Promise<ScrapedSource | null> => {
        const text = await fetchPageTextWithFallback(c.url, deadline, firecrawlBudget);
        const wc = text ? text.split(/\s+/).length : 0;
        return wc > 30 ? { kind: c.kind, url: c.url, wordCount: wc, text: text! } : null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        sources.push(r.value);
        totalWords += r.value.wordCount;
      }
    }
  }

  const corpus = sources.map((s) => s.text).join("\n\n---\n\n");
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
  const headers = { "Api-Token": apiKey, "Content-Type": "application/json" };

  const listRes = await fetchWithTimeout(`${baseUrl}/campaigns?orders[sdate]=DESC&limit=3`, { headers });
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const campaignIds: string[] = (listData.campaigns ?? []).slice(0, 3).map((c: any) => c.id).filter(Boolean);

  const results: { text: string; wordCount: number }[] = [];
  for (const id of campaignIds) {
    const msgRes = await fetchWithTimeout(`${baseUrl}/campaigns/${id}/messages`, { headers });
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