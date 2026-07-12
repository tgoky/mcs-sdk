import { callClaudeWithRetry, MODEL } from "@/lib/llm";
import { scrapeVoiceCorpus } from "./voice-scraper";

/**
 * Pin-Down recovery gap 1 — smart pre-fill.
 *
 * The OG SKILL.md's 5-phase agentic install ran a real Discovery phase:
 * crawl the buyer's site, detect their booking platform, check for an
 * existing confirmation page, and use all of that to cut down how much
 * the operator had to type. UTP replaced Discovery with a flat five-page
 * form the operator fills in entirely by hand.
 *
 * This is NOT a full recovery of the agentic install — that's a
 * deliberate product choice UTP made to hit the "no plugin, no CLI, no
 * Cowork session" bar (see the Tier 3 discussion in the transfer
 * analysis). What this restores is the time-saving part: an optional
 * "smart pre-fill" pass the operator can trigger from the onboarding
 * form, which crawls the buyer's domain and suggests values for the
 * fields that follow rather than leaving every field blank.
 */

export interface DiscoveryPrefillResult {
  domain: string;
  crawledAt: string;
  suggestedBuyerName?: string;
  suggestedOfferName?: string;
  suggestedIcp?: string;
  existingConfirmationPageUrl?: string;
  detectedBookingPlatform?: string;
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

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  return d;
}

async function fetchRaw(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": "ShowtimePinDownDiscovery/1.0 (+https://mcs-abra.vercel.app)" },
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
 * Checks a short list of common confirmation-page paths for a 200
 * response. Best-effort/heuristic, same rationale as voice-scraper.ts's
 * sales/pricing path guessing — this isn't a sitemap crawl, it's "does
 * anything obvious already exist here," which is exactly the question
 * Discovery needs answered before deciding whether to run the
 * existing-page audit at all.
 */
async function detectExistingConfirmationPage(base: string): Promise<string | undefined> {
  for (const path of CONFIRMATION_PAGE_PATHS) {
    const html = await fetchRaw(`${base}${path}`, 4000);
    if (html && html.length > 500) {
      return `${base}${path}`;
    }
  }
  return undefined;
}

function detectBookingPlatform(homepageHtml: string | null): string | undefined {
  if (!homepageHtml) return undefined;
  for (const sig of BOOKING_PLATFORM_SIGNATURES) {
    if (sig.pattern.test(homepageHtml)) return sig.platform;
  }
  return undefined;
}

/**
 * Runs the smart pre-fill pass: crawls the domain's homepage (and reuses
 * voice-scraper's sales/pricing detection for a slightly richer text
 * sample), asks Claude to infer a buyer name / offer name / ICP
 * description from what it found, checks for an existing confirmation
 * page, and sniffs the homepage HTML for a recognizable booking-platform
 * embed. Every suggestion is exactly that — a suggestion the operator
 * reviews and can override in the form, never auto-submitted.
 */
export async function runDiscoveryPrefill(domain: string): Promise<DiscoveryPrefillResult> {
  const base = normalizeDomain(domain);
  const notes: string[] = [];

  const [homepageHtml, { corpus, sources }, existingConfirmationPageUrl] = await Promise.all([
    fetchRaw(base),
    scrapeVoiceCorpus(domain),
    detectExistingConfirmationPage(base),
  ]);

  const detectedBookingPlatform = detectBookingPlatform(homepageHtml);

  if (!corpus || corpus.split(/\s+/).length < 40) {
    notes.push("Couldn't pull enough readable text from the domain to suggest buyer name/offer/ICP — fill those in manually.");
    return {
      domain: base,
      crawledAt: new Date().toISOString(),
      existingConfirmationPageUrl,
      detectedBookingPlatform,
      notes,
    };
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
      userMessage: corpus.slice(0, 6000),
      maxTokens: 400,
    });
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    suggestedBuyerName = parsed.buyer_name ?? undefined;
    suggestedOfferName = parsed.offer_name ?? undefined;
    suggestedIcp = parsed.icp ?? undefined;
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

  return {
    domain: base,
    crawledAt: new Date().toISOString(),
    suggestedBuyerName,
    suggestedOfferName,
    suggestedIcp,
    existingConfirmationPageUrl,
    detectedBookingPlatform,
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

/**
 * When Discovery (or the operator, manually) finds a confirmation page
 * already live at the buyer's domain, this scores it against the target
 * v1 criteria and produces the same "current strengths / weaknesses /
 * v1 improvements" delta doc the OG SKILL.md's conditional audit path
 * generated — surfaced in the dashboard as pinDownPageAudit, never used
 * to silently overwrite or skip generating the new page.
 */
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
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
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
