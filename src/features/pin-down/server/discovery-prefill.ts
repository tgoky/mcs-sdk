import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { scrapeVoiceCorpus } from "./voice-scraper";
import { scrapeDesignSignal, type DesignSignalResult } from "./design-scraper";
import { fetchWithTimeout } from "@/lib/http";

/**
 * Pin-Down recovery gap 1 — smart pre-fill.
 *
 * Crawls the buyer's site, detects their booking platform, checks for an
 * existing confirmation page, and uses Claude to suggest values for the
 * fields that follow.
 */

export interface DiscoveryPrefillResult {
  domain: string;
  crawledAt: string;
  suggestedBuyerName?: string;
  suggestedOfferName?: string;
  suggestedIcp?: string;
  scrapedCorpus?: string;
  existingConfirmationPageUrl?: string;
  detectedBookingPlatform?: string;
  /** Raw visual signal from the buyer's own site (design-scraper.ts), for
   * the dynamic confirmation-page templates (templates/dynamic/). Passed
   * straight through to buildConfirmationPageHtml as
   * PageBuilderInput.designSignal — undefined here means "render the
   * static default for whichever archetype gets picked", never a
   * broken page. */
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

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  return d;
}

/**
 * Minimal HTML strip — used ONLY as a last-resort fallback when
 * scrapeVoiceCorpus returns nothing and we're forced to analyze the raw
 * homepage HTML. Not a substitute for voice-scraper's Firecrawl pipeline.
 */
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

/**
 * Direct fetch for structural analysis only:
 * - Booking platform detection (needs raw HTML to find script/iframe embeds)
 * - Confirmation page existence check (needs raw HTML to check length)
 *
 * This is NOT the text extraction path — that goes through voice-scraper.ts
 * which uses Firecrawl first. This runs in parallel with voice-scraper.
 *
 * Kept at a short timeout because booking platform detection is non-critical
 * (user can select manually) and CF-protected sites will just 403.
 */
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

/**
 * Runs the smart pre-fill pass.
 *
 * Execution model:
 *   fetchRaw (structural) ──┐
 *   scrapeVoiceCorpus ──────┼── Promise.all (parallel)
 *   detectConfirmationPage ─┘
 *                              │
 *                      Claude inference
 *                              │
 *                      Return suggestions
 */
export async function runDiscoveryPrefill(domain: string): Promise<DiscoveryPrefillResult> {
  const base = normalizeDomain(domain);
  const notes: string[] = [];

  const [homepageHtml, { corpus, sources }, existingConfirmationPageUrl, designSignal] = await Promise.all([
    fetchRaw(base),
    scrapeVoiceCorpus(domain),
    detectExistingConfirmationPage(base),
    scrapeDesignSignal(domain).catch(() => null),
  ]);

  const detectedBookingPlatform = detectBookingPlatform(homepageHtml);

  // ── Decide what text to send Claude ──
  //
  // Priority 1: Voice corpus from Firecrawl pipeline (clean Markdown)
  // Priority 2: Stripped homepage HTML (noisy, last resort)
  // Abort: If neither has enough text
  let textToAnalyze = "";
  let usedFallback = false;

  if (corpus && corpus.trim().length > 50) {
    textToAnalyze = corpus;
  } else if (homepageHtml) {
    // BUG FIX: Old code passed raw HTML to Claude here.
    // Now we strip it first. Still noisy, but at least Claude sees
    // words instead of <div class="..."> tags.
    textToAnalyze = stripHtmlForFallback(homepageHtml);
    usedFallback = true;
  }

  if (textToAnalyze.trim().length < 20) {
    notes.push("Couldn't pull readable text from the domain — fill in details manually.");
    return {
      domain: base,
      crawledAt: new Date().toISOString(),
      scrapedCorpus: corpus || undefined,
      existingConfirmationPageUrl,
      detectedBookingPlatform,
      designSignal: designSignal ?? undefined,
      notes,
    };
  }

  if (usedFallback) {
    notes.push("Used a basic HTML strip of the homepage — the voice corpus pipeline didn't return enough. Results may be less accurate.");
  }

  let suggestedBuyerName: string | undefined;
  let suggestedOfferName: string | undefined;
  let suggestedIcp: string | undefined;

  try {
    const result = await callClaudeWithRetry({
      model: MODEL.FAST,
      system: `You infer basic business facts from marketing site text. Given the
text below, return ONLY a JSON object:
{ "buyer_name": "the company or personal brand name, or null if unclear",
  "offer_name": "the primary product/service/offer name being sold, or null if unclear",
  "icp": "one sentence describing who this is for (their ideal customer), or null if unclear" }
Return nothing but the JSON object. No preamble, no markdown fences. If you
aren't reasonably confident, use null rather than guessing.`,
      userMessage: textToAnalyze.slice(0, 6000),
      maxTokens: 400,
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

      suggestedIcp =
        parsed.icp ??
        parsed.ideal_customer ??
        parsed.idealCustomer ??
        parsed.target_customer ??
        parsed.targetCustomer ??
        parsed.who_is_the_ideal_customer ??
        parsed.target_audience ??
        undefined;
    }
  } catch (e: any) {
    notes.push(`Couldn't infer buyer/offer details from the crawl: ${e.message}`);
  }

  if (sources.length === 0) {
    notes.push("Only the homepage was reachable — no separate sales or pricing page found for a richer voice sample.");
  }
  if (existingConfirmationPageUrl) {
    notes.push(
      `Found an existing page at ${existingConfirmationPageUrl} — set stack.existing_confirmation_page_url to this to run the existing-page audit during setup.`
    );
  }
  if (!detectedBookingPlatform) {
    notes.push("Couldn't detect a recognizable booking platform from the homepage HTML — set booking_platform manually.");
  }
  if (!designSignal) {
    notes.push("Couldn't extract visual design signal from the site — the confirmation page will use the default theme for whichever template you pick, not one matched to your site.");
  }

  return {
    domain: base,
    crawledAt: new Date().toISOString(),
    suggestedBuyerName,
    suggestedOfferName,
    suggestedIcp,
    scrapedCorpus: corpus,
    existingConfirmationPageUrl,
    detectedBookingPlatform,
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
  context: { buyer: string; offerDetails?: any; brandVoiceProfile?: any }
): Promise<PageAuditResult> {
  const html = await fetchRaw(url, 8000);
  const now = new Date().toISOString();

  if (!html) {
    return {
      auditedUrl: url,
      auditedAt: now,
      existingPageStrengths: [],
      existingPageWeaknesses: [`Could not fetch ${url} — it may require auth, be behind a redirect this crawler doesn't follow, or no longer exist.`],
      v1Improvements: ["Proceed with the standard Pin-Down page since the existing page couldn't be audited."],
    };
  }

  const text = stripHtmlForAudit(html);

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

Return ONLY a JSON object:
{
  "existingPageStrengths": ["specific things this page already does well"],
  "existingPageWeaknesses": ["specific gaps or issues, e.g. no video, vague CTA, no reschedule path"],
  "v1Improvements": ["specific, concrete improvements the new Pin-Down page should make over this one"]
}
Be specific and concrete — no generic filler like "could be more engaging." Never fabricate content that isn't actually on the page.`;

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
    };
  } catch {
    return {
      auditedUrl: url,
      auditedAt: now,
      existingPageStrengths: [],
      existingPageWeaknesses: ["Audit generation returned an unparseable response — review the existing page manually."],
      v1Improvements: [],
    };
  }
}