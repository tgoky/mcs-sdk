import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { scrapeVoiceCorpus } from "./voice-scraper";
import { scrapeDesignSignal, type DesignSignalResult } from "./design-scraper";
import { fetchWithTimeout } from "@/lib/http";

/**
 * Pin-Down recovery gap 1 — smart pre-fill.
 *
 * Crawls the buyer's site, detects their booking platform, checks for an
 * existing confirmation page, extracts embedded video URLs, reputation intelligence
 * (competitors, entities, seed prompts, social handles, review metrics), and uses
 * Claude to suggest offer values (name, price, vertical, ICP).
 */

export interface HarvestedReviewBaseline {
  platform: "trustpilot" | "google" | "g2";
  rating?: number;
  reviewCount?: number;
  label?: string;
}

export interface DiscoveryPrefillResult {
  domain: string;
  crawledAt: string;
  suggestedBuyerName?: string;
  suggestedOfferName?: string;
  suggestedOfferPrice?: string;
  suggestedOfferVertical?: string;
  suggestedIcp?: string;
  suggestedHeroVideoUrl?: string;
  /** Direct category rivals or alternative platforms named or implied in site copy. */
  suggestedCompetitors?: string[];
  /** Sub-brands, proprietary product/tier names, or featured publications. */
  suggestedEntities?: string[];
  /** 5 to 8 starting questions prospective customers would ask an AI engine. */
  suggestedSeedPrompts?: string[];
  /** Official social handles and review profile links extracted from HTML/schema. */
  suggestedHandles?: Record<string, string>;
  /** Harvested review baseline metrics (Trustpilot, etc.). */
  suggestedReviewBaseline?: HarvestedReviewBaseline;
  scrapedCorpus?: string;
  existingConfirmationPageUrl?: string;
  detectedBookingPlatform?: string;
  detectedHostingPlatform?: string;
  designSignal?: DesignSignalResult;
  notes: string[];
}

const CONFIRMATION_PAGE_PATHS = [
  "/confirmation",
  "/confirmed",
  "/thank-you",
  "/thankyou",
  "/call-confirmed",
  "/booked",
  "/next-steps",
];

const BOOKING_PLATFORM_SIGNATURES: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "calendly", pattern: /calendly\.com/i },
  { platform: "cal_com", pattern: /cal\.com\/(?!docs)/i },
  { platform: "ghl_calendar", pattern: /(msgsndr\.com|leadconnectorhq\.com|gohighlevel)/i },
  { platform: "oncehub", pattern: /oncehub\.com/i },
];

const HOSTING_PLATFORM_SIGNATURES: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "webflow", pattern: /(<meta[^>]+name=["']generator["'][^>]+content=["']Webflow["']|assets-global\.website-files\.com|data-wf-(?:site|page)=)/i },
  { platform: "wordpress", pattern: /(<meta[^>]+name=["']generator["'][^>]+content=["']WordPress|\/wp-content\/|\/wp-includes\/)/i },
  { platform: "nextjs_vercel", pattern: /(__NEXT_DATA__|\/_next\/static\/)/i },
];

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  return d;
}

function stripHtmlForFallback(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRaw(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extracts video embed URLs (YouTube, Vimeo, Wistia, Loom) from HTML.
 */
export function extractEmbeddedVideoUrl(html: string | null): string | undefined {
  if (!html) return undefined;
  const match = html.match(
    /src=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/embed\/|player\.vimeo\.com\/video\/|fast\.wistia\.net\/embed\/|loom\.com\/embed\/)[^"']+)["']/i
  );
  return match?.[1];
}

async function detectExistingConfirmationPage(base: string): Promise<string | undefined> {
  const results = await Promise.all(
    CONFIRMATION_PAGE_PATHS.map(async (path) => {
      const html = await fetchRaw(`${base}${path}`, 3000);
      return html && html.length > 500 ? `${base}${path}` : undefined;
    })
  );
  return results.find((url): url is string => Boolean(url));
}

function detectBookingPlatform(homepageHtml: string | null): string | undefined {
  if (!homepageHtml) return undefined;
  for (const sig of BOOKING_PLATFORM_SIGNATURES) {
    if (sig.pattern.test(homepageHtml)) return sig.platform;
  }
  return undefined;
}

function detectHostingPlatform(homepageHtml: string | null): string | undefined {
  if (!homepageHtml) return undefined;
  for (const sig of HOSTING_PLATFORM_SIGNATURES) {
    if (sig.pattern.test(homepageHtml)) return sig.platform;
  }
  return undefined;
}

// ── Deep Harvester Helper 1: JSON-LD & Footer Schema Handle Parser ─────────

function parseAndAssignHandle(urlStr: string, handles: Record<string, string>) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");

    if ((host.includes("twitter.com") || host.includes("x.com")) && path && !handles.twitter) {
      const handle = path.split("/")[1];
      if (handle && !["intent", "share", "home", "search"].includes(handle.toLowerCase())) {
        handles.twitter = `@${handle}`;
      }
    } else if (host.includes("linkedin.com") && path && !handles.linkedin) {
      handles.linkedin = `https://${host}${path}`;
    } else if (host.includes("trustpilot.com") && path.includes("/review/") && !handles.trustpilot) {
      handles.trustpilot = `https://${host}${path}`;
    } else if (host.includes("g2.com") && path.includes("/products/") && !handles.g2) {
      handles.g2 = `https://${host}${path}`;
    } else if (host.includes("capterra.com") && !handles.capterra) {
      handles.capterra = `https://${host}${path}`;
    } else if (host.includes("youtube.com") && path && !handles.youtube) {
      handles.youtube = `https://${host}${path}`;
    }
  } catch {
    // Ignore invalid URLs
  }
}

export function extractSocialAndReviewHandles(
  html: string | null,
  siteDomain: string
): Record<string, string> {
  if (!html) return {};
  const handles: Record<string, string> = {};

  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const sameAsList: string[] = Array.isArray(data.sameAs)
        ? data.sameAs
        : Array.isArray(data?.organization?.sameAs)
        ? data.organization.sameAs
        : typeof data.sameAs === "string"
        ? [data.sameAs]
        : [];

      for (const url of sameAsList) {
        parseAndAssignHandle(url, handles);
      }
    } catch {
      // Ignore unparseable JSON-LD blocks
    }
  }

  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi);
  for (const match of hrefMatches) {
    parseAndAssignHandle(match[1], handles);
  }

  return handles;
}

// ── Deep Harvester Helper 2: Trustpilot Review Baseline Scraper ─────────────

export async function fetchTrustpilotBaseline(domain: string): Promise<HarvestedReviewBaseline | null> {
  const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const url = `https://www.trustpilot.com/review/${cleanDomain}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    const ratingMatch = html.match(/["']ratingValue["']:\s*["']?([\d.]+)/i) || html.match(/trustscore\s*([\d.]+)/i);
    const countMatch = html.match(/["']reviewCount["']:\s*["']?(\d+)/i) || html.match(/([\d,]+)\s*reviews/i);

    if (ratingMatch?.[1]) {
      const rating = parseFloat(ratingMatch[1]);
      const reviewCount = countMatch?.[1] ? parseInt(countMatch[1].replace(/,/g, ""), 10) : undefined;
      return {
        platform: "trustpilot",
        rating,
        reviewCount,
        label: rating >= 4.5 ? "Excellent" : rating >= 4.0 ? "Great" : "Average",
      };
    }
  } catch {
    // Graceful degradation
  }
  return null;
}

/**
 * Runs the smart pre-fill pass.
 */
export async function runDiscoveryPrefill(domain: string): Promise<DiscoveryPrefillResult> {
  const base = normalizeDomain(domain);
  const notes: string[] = [];

  const [
    homepageHtml,
    { corpus, sources },
    existingConfirmationPageUrl,
    designSignal,
    reviewBaseline,
  ] = await Promise.all([
    fetchRaw(base),
    scrapeVoiceCorpus(domain),
    detectExistingConfirmationPage(base),
    scrapeDesignSignal(domain).catch(() => null),
    fetchTrustpilotBaseline(base).catch(() => null),
  ]);

  const detectedBookingPlatform = detectBookingPlatform(homepageHtml);
  const detectedHostingPlatform = detectHostingPlatform(homepageHtml);
  const suggestedHandles = extractSocialAndReviewHandles(homepageHtml, base);
  const suggestedHeroVideoUrl = extractEmbeddedVideoUrl(homepageHtml);

  let textToAnalyze = "";
  let usedFallback = false;

  if (corpus && corpus.trim().length > 50) {
    textToAnalyze = corpus;
  } else if (homepageHtml) {
    textToAnalyze = stripHtmlForFallback(homepageHtml);
    usedFallback = true;
  }

  if (textToAnalyze.trim().length < 20) {
    notes.push("Couldn't pull readable text from the domain. Fill in details manually.");
    return {
      domain: base,
      crawledAt: new Date().toISOString(),
      suggestedHeroVideoUrl,
      suggestedHandles: Object.keys(suggestedHandles).length > 0 ? suggestedHandles : undefined,
      suggestedReviewBaseline: reviewBaseline ?? undefined,
      scrapedCorpus: corpus || undefined,
      existingConfirmationPageUrl,
      detectedBookingPlatform,
      detectedHostingPlatform,
      designSignal: designSignal ?? undefined,
      notes,
    };
  }

  if (usedFallback) {
    notes.push("Used a basic HTML strip of the homepage. The voice corpus pipeline didn't return enough. Results may be less accurate.");
  }

  let suggestedBuyerName: string | undefined;
  let suggestedOfferName: string | undefined;
  let suggestedOfferPrice: string | undefined;
  let suggestedOfferVertical: string | undefined;
  let suggestedIcp: string | undefined;
  let suggestedCompetitors: string[] | undefined;
  let suggestedEntities: string[] | undefined;
  let suggestedSeedPrompts: string[] | undefined;

  try {
    const result = await callClaudeWithRetry({
      model: MODEL.FAST,
      system: `You infer basic business facts and reputation intelligence from marketing site text. Given the text below, return ONLY a JSON object:
{
  "buyer_name": "the company or personal brand name, or null if unclear",
  "offer_name": "the primary product/service/offer name being sold, or null if unclear",
  "offer_price": "pricing details or estimated tier e.g. $997, $5k/mo, or null if unclear",
  "offer_vertical": "industry or vertical e.g. B2B SaaS, Agency, Coaching, Fitness, or null if unclear",
  "icp": "one sentence describing who this is for (their ideal customer), or null if unclear",
  "competitors": ["2 to 4 direct category competitors or alternative solutions named or implied in the text, or [] if none"],
  "entities": ["sub-brands, proprietary product/tier names, or featured publications, or [] if none"],
  "seed_prompts": ["5 to 8 starting questions prospective customers would ask an AI engine (ChatGPT/Claude/Perplexity) about this business, or [] if none"]
}
Return nothing but the JSON object. No preamble, no markdown fences. If you aren't reasonably confident, use null or [] rather than guessing.`,
      userMessage: textToAnalyze.slice(0, 6000),
      maxTokens: 750,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      suggestedBuyerName =
        parsed.buyer_name ??
        parsed.buyerName ??
        parsed.company_name ??
        parsed.companyName ??
        parsed.brand_name ??
        undefined;

      suggestedOfferName =
        parsed.offer_name ??
        parsed.offerName ??
        parsed.product_name ??
        parsed.productName ??
        parsed.service_name ??
        undefined;

      suggestedOfferPrice =
        parsed.offer_price ??
        parsed.offerPrice ??
        parsed.price ??
        undefined;

      suggestedOfferVertical =
        parsed.offer_vertical ??
        parsed.offerVertical ??
        parsed.vertical ??
        parsed.industry ??
        undefined;

      suggestedIcp =
        parsed.icp ??
        parsed.ideal_customer ??
        parsed.idealCustomer ??
        parsed.target_customer ??
        parsed.targetCustomer ??
        parsed.who_is_the_ideal_customer ??
        parsed.target_audience ??
        undefined;

      if (Array.isArray(parsed.competitors)) {
        const list = parsed.competitors
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim());
        if (list.length > 0) suggestedCompetitors = list;
      }

      if (Array.isArray(parsed.entities)) {
        const list = parsed.entities
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim());
        if (list.length > 0) suggestedEntities = list;
      }

      const rawPrompts = parsed.seed_prompts ?? parsed.seedPrompts;
      if (Array.isArray(rawPrompts)) {
        const list = rawPrompts
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim())
          .slice(0, 8);
        if (list.length > 0) suggestedSeedPrompts = list;
      }
    }
  } catch (e: any) {
    notes.push(`Couldn't infer buyer/offer details from the crawl: ${e.message}`);
  }

  if (sources.length === 0) {
    notes.push("Only the homepage was reachable. No separate sales or pricing page found for a richer voice sample.");
  }
  if (existingConfirmationPageUrl) {
    notes.push(
      `Found an existing page at ${existingConfirmationPageUrl}. Set stack.existing_confirmation_page_url to this to run the existing-page audit during setup.`
    );
  }
  if (!detectedBookingPlatform) {
    notes.push("Couldn't detect a recognizable booking platform from the homepage HTML. Set booking_platform manually.");
  }
  if (!designSignal) {
    notes.push("Couldn't extract visual design signal from the site. The confirmation page will use the default theme for whichever template you pick, not one matched to your site.");
  }

  return {
    domain: base,
    crawledAt: new Date().toISOString(),
    suggestedBuyerName,
    suggestedOfferName,
    suggestedOfferPrice,
    suggestedOfferVertical,
    suggestedIcp,
    suggestedHeroVideoUrl,
    suggestedCompetitors,
    suggestedEntities,
    suggestedSeedPrompts,
    suggestedHandles: Object.keys(suggestedHandles).length > 0 ? suggestedHandles : undefined,
    suggestedReviewBaseline: reviewBaseline ?? undefined,
    scrapedCorpus: corpus,
    existingConfirmationPageUrl,
    detectedBookingPlatform,
    detectedHostingPlatform,
    designSignal: designSignal ?? undefined,
    notes,
  };
}

// ── Existing-page audit (Pin-Down recovery gap 7) ───────────────────────────

export interface PageAuditResult {
  auditedUrl: string;
  auditedAt: string;
  existingPageStrengths: string[];
  existingPageWeaknesses: string[];
  v1Improvements: string[];
  competitorComparison?: { url: string; notes: string[] } | null;
}

function stripHtmlForAudit(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

export async function auditExistingConfirmationPage(
  url: string,
  context: { buyer: string; offerDetails?: any; brandVoiceProfile?: any },
  competitorUrl?: string
): Promise<PageAuditResult> {
  const html = await fetchRaw(url, 8000);
  const now = new Date().toISOString();

  if (!html) {
    return {
      auditedUrl: url,
      auditedAt: now,
      existingPageStrengths: [],
      existingPageWeaknesses: [`Could not fetch ${url}. It may require auth, be behind a redirect this crawler doesn't follow, or no longer exist.`],
      v1Improvements: ["Proceed with the standard Pin-Down page since the existing page couldn't be audited."],
    };
  }

  const text = stripHtmlForAudit(html);

  const competitorHtml = competitorUrl ? await fetchRaw(competitorUrl, 8000) : null;
  const competitorText = competitorHtml ? stripHtmlForAudit(competitorHtml) : null;

  const system = `You are auditing an existing post-booking confirmation page for
 ${context.buyer} against what a well-built confirmation page should
include: a hero video/intro setting expectations, a clear "what to expect
on the call" section, breakout content answering common questions while
the prospect waits, social proof (if any claims are made, are they
credible/specific), and a clear reschedule/contact path.

Offer context: ${JSON.stringify(context.offerDetails ?? {})}
Target brand voice: ${JSON.stringify(context.brandVoiceProfile ?? {})}

Page content (text-extracted):
 ${text}
${
  competitorText
    ? `\nA competitor's confirmation page at ${competitorUrl} (text-extracted): compare against it specifically, calling out what it does that this page doesn't and vice versa:\n${competitorText}\n`
    : ""
}

Return ONLY a JSON object:
{
  "existingPageStrengths": ["specific things this page already does well"],
  "existingPageWeaknesses": ["specific gaps or issues, e.g. no video, vague CTA, no reschedule path"],
  "v1Improvements": ["specific, concrete improvements the new Pin-Down page should make over this one"]${
    competitorText ? ',\n  "competitorComparisonNotes": ["specific, concrete comparisons against the competitor page. What they do better, what this page does better"]' : ""
  }
}
Be specific and concrete. No generic filler like "could be more engaging." Never fabricate content that isn't actually on either page.`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Audit this page now.",
    maxTokens: 1500,
  });

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      auditedUrl: url,
      auditedAt: now,
      existingPageStrengths: parsed.existingPageStrengths ?? [],
      existingPageWeaknesses: parsed.existingPageWeaknesses ?? [],
      v1Improvements: parsed.v1Improvements ?? [],
      competitorComparison:
        competitorText && competitorUrl ? { url: competitorUrl, notes: parsed.competitorComparisonNotes ?? [] } : undefined,
    };
  } catch {
    return {
      auditedUrl: url,
      auditedAt: now,
      existingPageStrengths: [],
      existingPageWeaknesses: ["Audit generation returned an unparseable response. Review the existing page manually."],
      v1Improvements: [],
    };
  }
}