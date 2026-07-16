/**
 * Pin-Down recovery gap 2 — site + brand-resource crawl for voice
 * extraction.
 *
 * The OG SKILL.md's default voice-extraction path crawled the buyer's
 * marketing site, sales page, and pricing page, and pulled their last
 * three ESP broadcast emails — only falling back to "ask the buyer to
 * paste something" when that returned under 1,000 words. UTP dropped the
 * crawl entirely: rawVoiceCorpus is 100% operator-pasted text with no
 * scrape path at all, which is a narrower and more manual input surface
 * than the original.
 *
 * This module restores the scrape path as an ALTERNATIVE/ADDITIVE input
 * to rawVoiceCorpus, not a replacement — onboarding-service.ts merges
 * whatever this returns with any operator-pasted corpus before calling
 * extractVoiceProfile(), and records what it actually pulled in
 * voiceScrapeArtifacts so the result is auditable (the operator can see
 * exactly which pages/sources fed the voice profile, same transparency
 * principle as pinDownPageAudit).
 */


import { fetchWithTimeout } from "@/lib/http";
interface ScrapedSource {
  kind: "marketing_site" | "sales_page" | "pricing_page";
  url: string;
  wordCount: number;
  text: string;
}

const CRAWL_TIMEOUT_MS = 8000;
const MAX_CHARS_PER_PAGE = 12000; // keep the LLM prompt bounded
const USER_AGENT = "ShowtimePinDownVoiceCrawler/1.0 (+https://mcs-abra.vercel.app)";

/**
 * Strips tags/scripts/styles down to visible text. Deliberately simple
 * (regex-based, not a full HTML parser) — this text is only ever fed to
 * Claude for tone/vocabulary extraction, not rendered or re-published, so
 * perfect fidelity isn't required, just "readable prose."
 */
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

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  return d;
}

/**
 * Rate-limited, best-effort crawl of the buyer's marketing site, sales
 * page, and pricing page. Rate-limiting here is deliberately conservative
 * (sequential fetches, one buyer domain at a time, no concurrent fan-out)
 * — this hits a domain we don't operate maybe 3 times ever per
 * onboarding, so a simple sequential pass respects the target site
 * without needing a real crawl-delay/robots.txt parser for what is, in
 * practice, three requests.
 *
 * Common sales/pricing paths are tried in order and the first hit per
 * category wins — this is a heuristic, not a sitemap crawl, which matches
 * the OG SKILL.md's own framing of this as "the default path," with a
 * buyer-provided corpus as the documented alternative when it comes up
 * short.
 */
export async function scrapeVoiceCorpus(domain: string): Promise<{
  corpus: string;
  sources: ScrapedSource[];
}> {
  const base = normalizeDomain(domain);
  const sources: ScrapedSource[] = [];

  const homepageText = await fetchPageText(base);
  if (homepageText && homepageText.split(/\s+/).length > 20) {
    sources.push({ kind: "marketing_site", url: base, wordCount: homepageText.split(/\s+/).length, text: homepageText });
  }

  const salesPaths = ["/offer", "/work-with-us", "/apply", "/get-started"];
  for (const path of salesPaths) {
    const text = await fetchPageText(`${base}${path}`);
    if (text && text.split(/\s+/).length > 40) {
      sources.push({ kind: "sales_page", url: `${base}${path}`, wordCount: text.split(/\s+/).length, text });
      break; // one sales page is enough — first real hit wins
    }
  }

  const pricingPaths = ["/pricing", "/plans", "/packages"];
  for (const path of pricingPaths) {
    const text = await fetchPageText(`${base}${path}`);
    if (text && text.split(/\s+/).length > 20) {
      sources.push({ kind: "pricing_page", url: `${base}${path}`, wordCount: text.split(/\s+/).length, text });
      break;
    }
  }

  const corpus = sources.map((s) => s.text).join("\n\n---\n\n");
  return { corpus, sources };
}

/**
 * ESP broadcast pull — the third leg of the OG SKILL.md's default scrape
 * path ("pull last three broadcast emails through the ESP API when
 * connected"). Only wired for Klaviyo today since it's the only email
 * platform with a documented, stable "list campaigns" + "get campaign
 * message" pair in email.ts's existing client set; the other platforms'
 * campaign/broadcast history APIs are either not implemented there yet or
 * not exposed on the plan tiers Pin-Down buyers are likely to be on.
 * Returns [] (never throws) so a missing/unsupported ESP never blocks
 * onboarding — this is additive to the site crawl, not required.
 */
export async function scrapeEspBroadcasts(
  emailPlatform: string | undefined,
  apiKey: string | undefined
): Promise<{ text: string; wordCount: number }[]> {
  if (emailPlatform !== "klaviyo" || !apiKey) return [];

  try {
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
        if (text.split(/\s+/).length > 20) {
          results.push({ text, wordCount: text.split(/\s+/).length });
        }
      }
    }
    return results;
  } catch (e: any) {
    console.warn("[voice-scraper] ESP broadcast pull failed (non-fatal):", e.message);
    return [];
  }
}
