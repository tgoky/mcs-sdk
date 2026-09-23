import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { crawlSite } from "./voice-scraper";
import { designSignalFromHtml, scrapeDesignSignal, type DesignSignalResult } from "./design-scraper";
import {
  detectTechStack,
  extractBookingLinks,
  extractContactAndBrand,
  extractJsonLd,
  extractSocialProfiles,
  linksFromHtml,
  type BookingLink,
  type ContactAndBrand,
  type JsonLdSignals,
  type TechStack,
} from "./site-signals";
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
  platform: "trustpilot" | "google" | "g2" | "site";
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
  /** Everything read from the site beyond the basics above. */
  deep?: DeepSiteReading;
  notes: string[];
}

export interface SiteTestimonial {
  quote: string;
  name?: string;
  role?: string;
  company?: string;
  result?: string;
  sourceUrl?: string;
}

export interface DeepSiteReading {
  testimonials: SiteTestimonial[];
  faqs: { question: string; answer?: string }[];
  objections: string[];
  offers: { name: string; price?: string; billing?: string; description?: string }[];
  guarantee?: string;
  founder?: { name: string; role?: string };
  team: { name: string; role?: string }[];
  primaryCta?: string;
  caseStudyResults: string[];
  pressMentions: string[];
  socialProfiles: Record<string, string>;
  bookingLinks: BookingLink[];
  techStack: TechStack;
  contact: ContactAndBrand & { address?: string };
  jsonLd: Pick<JsonLdSignals, "organizationName" | "rating" | "offers">;
  pagesRead: { kind: string; url: string; wordCount: number }[];
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

const CONFIRMATION_WORDING = /\b(you'?re (all )?(set|booked|confirmed|in)|call (is )?(confirmed|booked|scheduled)|booking (is )?confirmed|see you (on|soon)|thank(s| you) for (booking|scheduling)|what to expect|before (our|your) call|next steps)\b/i;

function titleOf(html: string): string {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().toLowerCase();
}

/**
 * Finds a confirmation page the client already has. Many sites answer any
 * address with their homepage (and a 200), which used to make every one of
 * them "have" a confirmation page; a page only counts now when it differs
 * from what the site returns for a nonsense address and reads like a
 * confirmation.
 */
async function detectExistingConfirmationPage(base: string): Promise<string | undefined> {
  const [nonsense, ...candidates] = await Promise.all([
    fetchRaw(`${base}/__not-a-real-page-${Date.now().toString(36)}`, 3000),
    ...CONFIRMATION_PAGE_PATHS.map((path) => fetchRaw(`${base}${path}`, 3000).then((html) => ({ path, html }))),
  ]) as [string | null, ...{ path: string; html: string | null }[]];
  const fallbackTitle = nonsense ? titleOf(nonsense) : null;
  const fallbackLength = nonsense?.length ?? 0;
  for (const c of candidates) {
    if (!c.html || c.html.length < 500) continue;
    const sameAsFallback =
      nonsense !== null && titleOf(c.html) === fallbackTitle && Math.abs(c.html.length - fallbackLength) < Math.max(200, fallbackLength * 0.03);
    if (sameAsFallback) continue;
    if (!CONFIRMATION_WORDING.test(stripHtmlForFallback(c.html))) continue;
    return `${base}${c.path}`;
  }
  return undefined;
}

function detectBookingPlatform(pages: (string | null)[]): string | undefined {
  for (const html of pages) {
    if (!html) continue;
    for (const sig of BOOKING_PLATFORM_SIGNATURES) {
      if (sig.pattern.test(html)) return sig.platform;
    }
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

// ── The reading ────────────────────────────────────────────────────────

/** Characters of crawled copy Claude reads: the whole deep crawl, not the
 * first homepage-sized slice (6,000 characters used to cut off the
 * pricing and proof pages the crawl had just paid for). */
const READING_CHAR_BUDGET = 60_000;

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A testimonial or FAQ is only kept when its words are really on the site:
 * the first stretch of it must appear in the crawled copy. Claude can't
 * invent proof this way. */
function appearsInCopy(snippet: string, copy: string): boolean {
  const s = normalizeForMatch(snippet);
  if (s.length < 12) return false;
  return copy.includes(s.slice(0, Math.min(60, s.length)));
}

function strings(v: unknown, max = 12): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max) : [];
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : undefined;
}

/**
 * Runs the smart pre-fill pass: one deep crawl (voice-scraper.ts), the
 * free signals from every page's HTML (site-signals.ts), and one Claude
 * reading of all the copy.
 */
export async function runDiscoveryPrefill(domain: string): Promise<DiscoveryPrefillResult> {
  const base = normalizeDomain(domain);
  const notes: string[] = [];

  const [crawl, existingConfirmationPageUrl, trustpilotBaseline] = await Promise.all([
    crawlSite(domain),
    detectExistingConfirmationPage(base),
    fetchTrustpilotBaseline(base).catch(() => null),
  ]);
  const { corpus, sources } = crawl;

  // The rendered homepage from the crawl; a plain fetch only when the
  // crawl couldn't get one.
  const homepageHtml = crawl.homepageHtml ?? (await fetchRaw(base));
  const pageHtml = [homepageHtml, ...sources.filter((s) => s.kind !== "marketing_site").map((s) => s.html ?? null)].filter(
    (h): h is string => Boolean(h)
  );
  const allLinks = [
    ...sources.flatMap((s) => s.links ?? []),
    ...pageHtml.flatMap((h) => linksFromHtml(h, base)),
  ];

  // ── Free signals ──
  const jsonLd = pageHtml.map(extractJsonLd).reduce<JsonLdSignals>(
    (acc, j) => ({
      organizationName: acc.organizationName ?? j.organizationName,
      logoUrl: acc.logoUrl ?? j.logoUrl,
      sameAs: [...acc.sameAs, ...j.sameAs],
      telephone: acc.telephone ?? j.telephone,
      email: acc.email ?? j.email,
      address: acc.address ?? j.address,
      offers: [...acc.offers, ...j.offers],
      faqs: [...acc.faqs, ...j.faqs],
      rating: acc.rating ?? j.rating,
      reviews: [...acc.reviews, ...j.reviews],
      people: [...acc.people, ...j.people],
    }),
    { sameAs: [], offers: [], faqs: [], reviews: [], people: [] }
  );
  const socialProfiles = extractSocialProfiles([...allLinks, ...jsonLd.sameAs]);
  const bookingLinks = pageHtml.flatMap(extractBookingLinks).filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i);
  const techStack = detectTechStack(pageHtml);
  const contact = homepageHtml ? extractContactAndBrand(homepageHtml, base) : { emails: [], phones: [] };

  const detectedBookingPlatform = bookingLinks[0]?.platform ?? detectBookingPlatform(pageHtml);
  const detectedHostingPlatform = detectHostingPlatform(homepageHtml);
  // The long-standing handle map, now from every page and every network.
  const suggestedHandles = { ...extractSocialAndReviewHandles(homepageHtml, base), ...socialProfiles };
  const suggestedHeroVideoUrl = pageHtml.map(extractEmbeddedVideoUrl).find(Boolean);
  // Colors and fonts from the homepage HTML the crawl already has; a
  // separate paid call only when it has none.
  const designSignal = designSignalFromHtml(homepageHtml) ?? (homepageHtml ? null : await scrapeDesignSignal(domain).catch(() => null));
  const reviewBaseline: HarvestedReviewBaseline | null =
    trustpilotBaseline ??
    (jsonLd.rating ? { platform: "site", rating: jsonLd.rating.value, reviewCount: jsonLd.rating.count, label: "From the site's own review data" } : null);

  let textToAnalyze = "";
  let usedFallback = false;
  if (corpus && corpus.trim().length > 50) {
    textToAnalyze = corpus;
  } else if (homepageHtml) {
    textToAnalyze = stripHtmlForFallback(homepageHtml);
    usedFallback = true;
  }

  const deep: DeepSiteReading = {
    testimonials: [],
    faqs: jsonLd.faqs.slice(0, 20),
    objections: [],
    offers: [],
    team: [],
    caseStudyResults: [],
    pressMentions: [],
    socialProfiles,
    bookingLinks,
    techStack,
    contact: {
      ...contact,
      emails: [...new Set([...(jsonLd.email ? [jsonLd.email.toLowerCase()] : []), ...contact.emails])],
      phones: [...new Set([...(jsonLd.telephone ? [jsonLd.telephone] : []), ...contact.phones])],
      logoUrl: contact.logoUrl ?? jsonLd.logoUrl,
      address: jsonLd.address,
    },
    jsonLd: { organizationName: jsonLd.organizationName, rating: jsonLd.rating, offers: jsonLd.offers },
    pagesRead: sources.map((s) => ({ kind: s.kind, url: s.url, wordCount: s.wordCount })),
  };
  const founderFromLd = jsonLd.people.find((p) => /founder|ceo|owner/i.test(p.jobTitle ?? ""));
  if (founderFromLd) deep.founder = { name: founderFromLd.name, role: founderFromLd.jobTitle };

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
      deep,
      notes,
    };
  }

  if (usedFallback) {
    notes.push("Used a basic HTML strip of the homepage. The crawl didn't return enough. Results may be less accurate.");
  }

  let suggestedBuyerName: string | undefined;
  let suggestedOfferName: string | undefined;
  let suggestedOfferPrice: string | undefined;
  let suggestedOfferVertical: string | undefined;
  let suggestedIcp: string | undefined;
  let suggestedCompetitors: string[] | undefined;
  let suggestedEntities: string[] | undefined;
  let suggestedSeedPrompts: string[] | undefined;

  // Structured data the site publishes about itself, given to Claude as
  // the most reliable evidence on the page.
  const structuredHints = {
    organizationName: jsonLd.organizationName,
    offers: jsonLd.offers.slice(0, 10),
    people: jsonLd.people.slice(0, 10),
  };

  try {
    const result = await callClaudeWithRetry({
      model: MODEL.SYNTHESIS,
      system: `You read a business's website (several pages, each headed [page_kind url]) and pull out the facts a sales team needs. Return ONLY a JSON object:
{
  "buyer_name": "the company or personal brand name, or null",
  "offer_name": "the main offer people book a call about, or null",
  "offer_price": "its price exactly as the site states it (e.g. $997, $5k/mo), or null if the site doesn't state one",
  "offer_vertical": "industry, e.g. B2B SaaS, Agency, Coaching, Fitness, or null",
  "icp": "one sentence on who this is for, or null",
  "offers": [{ "name": "each offer or pricing tier", "price": "as stated, or null", "billing": "one-time / monthly / yearly / null", "description": "one line" }],
  "testimonials": [{ "quote": "the testimonial copied WORD FOR WORD from the page", "name": "person or null", "role": "their title or null", "company": "or null", "result": "the outcome they describe, short, or null", "source_page": "the url it was on" }],
  "faqs": [{ "question": "copied word for word", "answer": "the site's answer, shortened to 1-2 sentences" }],
  "objections": ["worries or hesitations the copy answers or implies, phrased the way a prospect would say them (e.g. 'Is this too expensive for a small team?')"],
  "guarantee": "the guarantee or refund terms as stated, or null",
  "founder": { "name": "founder or main expert, or null", "role": "or null" },
  "team": [{ "name": "named team members", "role": "or null" }],
  "primary_cta": "the main call to action's wording, e.g. 'Book a strategy call', or null",
  "case_study_results": ["specific results with numbers, e.g. 'Took Acme from $10k to $40k/mo in 90 days'"],
  "press_mentions": ["publications or brands in 'as seen in' / logos sections"],
  "competitors": ["2 to 4 direct competitors or alternatives named or implied"],
  "entities": ["sub-brands, product or tier names, featured publications"],
  "seed_prompts": ["5 to 8 questions a prospect would ask an AI engine about this business"]
}
Rules: use only what the pages say. Copy testimonials and FAQ questions exactly; never write one. If something isn't there, use null or []. No preamble, no markdown fences.`,
      userMessage: `Structured data the site publishes about itself:\n${JSON.stringify(structuredHints)}\n\nPages:\n${textToAnalyze.slice(0, READING_CHAR_BUDGET)}`,
      maxTokens: 4000,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const copy = normalizeForMatch(textToAnalyze + " " + pageHtml.map(stripHtmlForFallback).join(" "));

      suggestedBuyerName = text(parsed.buyer_name) ?? jsonLd.organizationName;
      suggestedOfferName = text(parsed.offer_name);
      suggestedOfferPrice = text(parsed.offer_price);
      suggestedOfferVertical = text(parsed.offer_vertical);
      suggestedIcp = text(parsed.icp);
      const competitors = strings(parsed.competitors, 6);
      if (competitors.length) suggestedCompetitors = competitors;
      const entities = strings(parsed.entities, 10);
      if (entities.length) suggestedEntities = entities;
      const prompts = strings(parsed.seed_prompts, 8);
      if (prompts.length) suggestedSeedPrompts = prompts;

      if (Array.isArray(parsed.offers)) {
        deep.offers = parsed.offers
          .filter((o: { name?: unknown }) => text(o?.name))
          .slice(0, 12)
          .map((o: Record<string, unknown>) => ({ name: text(o.name)!, price: text(o.price), billing: text(o.billing), description: text(o.description) }));
      }
      if (Array.isArray(parsed.testimonials)) {
        deep.testimonials = parsed.testimonials
          .filter((t: { quote?: unknown }) => text(t?.quote) && appearsInCopy(String(t.quote), copy))
          .slice(0, 12)
          .map((t: Record<string, unknown>) => ({
            quote: text(t.quote)!,
            name: text(t.name),
            role: text(t.role),
            company: text(t.company),
            result: text(t.result),
            sourceUrl: text(t.source_page),
          }));
      }
      // The site's own review markup counts as testimonials too.
      for (const r of jsonLd.reviews) {
        if (deep.testimonials.length >= 12) break;
        if (!deep.testimonials.some((t) => normalizeForMatch(t.quote) === normalizeForMatch(r.body))) deep.testimonials.push({ quote: r.body, name: r.author });
      }
      if (Array.isArray(parsed.faqs)) {
        const seen = new Set(deep.faqs.map((f) => normalizeForMatch(f.question)));
        for (const f of parsed.faqs as Record<string, unknown>[]) {
          const q = text(f?.question);
          if (!q || seen.has(normalizeForMatch(q)) || !appearsInCopy(q, copy)) continue;
          seen.add(normalizeForMatch(q));
          deep.faqs.push({ question: q, answer: text(f.answer) });
          if (deep.faqs.length >= 20) break;
        }
      }
      deep.objections = strings(parsed.objections, 10);
      deep.guarantee = text(parsed.guarantee);
      const founderName = text(parsed.founder?.name);
      if (!deep.founder && founderName) deep.founder = { name: founderName, role: text(parsed.founder?.role) };
      if (Array.isArray(parsed.team)) {
        deep.team = parsed.team
          .filter((m: { name?: unknown }) => text(m?.name))
          .slice(0, 12)
          .map((m: Record<string, unknown>) => ({ name: text(m.name)!, role: text(m.role) }));
      }
      deep.primaryCta = text(parsed.primary_cta);
      deep.caseStudyResults = strings(parsed.case_study_results, 10);
      deep.pressMentions = strings(parsed.press_mentions, 12);
    }
  } catch (e: unknown) {
    notes.push(`Couldn't read the offer details from the crawl: ${e instanceof Error ? e.message : String(e)}`);
  }

  // A price the site publishes in its structured data beats a reading.
  const publishedPrice = jsonLd.offers.find((o) => o.price);
  if (!suggestedOfferPrice && publishedPrice?.price) {
    suggestedOfferPrice = `${publishedPrice.currency === "USD" || !publishedPrice.currency ? "$" : `${publishedPrice.currency} `}${publishedPrice.price}`;
  }

  if (sources.length <= 1) {
    notes.push("Only the homepage was reachable. No separate sales or pricing page found for a richer reading.");
  }
  if (existingConfirmationPageUrl) {
    notes.push(
      `Found an existing page at ${existingConfirmationPageUrl}. Set stack.existing_confirmation_page_url to this to run the existing-page audit during setup.`
    );
  }
  if (!detectedBookingPlatform) {
    notes.push("Couldn't detect a recognizable booking platform on the site. Set booking_platform manually.");
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
    deep,
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