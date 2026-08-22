// src/features/pin-down/server/design-scraper.ts
//
// Extracts real visual signal from a buyer's site for the dynamic
// confirmation-page templates (templates/dynamic/). Sibling to
// voice-scraper.ts and deliberately built the same way: Firecrawl first,
// same timeout/budget shape, fails soft to null rather than throwing.
//
// The one thing this does NOT do is run its own headless browser.
// voice-scraper.ts's existing Firecrawl integration already renders pages
// server-side (formats: ["markdown"]); this asks the SAME /v2/scrape
// endpoint for `rawHtml` instead, with a longer `waitFor` so a
// client-rendered SPA (Lovable/Vite/React output included) finishes
// hydrating before Firecrawl captures the DOM. discovery-prefill.ts's
// existing fetchRaw() is a plain unauthenticated fetch with no JS
// execution — fine for booking-platform regex sniffing on server-rendered
// markup, useless for design signal on a client-rendered app, since it'd
// see an empty <div id="root"> shell. That's the actual reason this is a
// separate function instead of extending fetchRaw().
//
// classifySiteSignal() (templates/dynamic/tokens.ts) is a pure function of
// RawSiteSignal and has its own test coverage independent of network
// access — this file's only job is producing a well-formed RawSiteSignal
// from a real URL. If Firecrawl is unconfigured or the request fails,
// scrapeDesignSignal() returns null and callers fall back to
// DEFAULT_TOKENS (see onboarding-service.ts wiring below), the same
// "safe on failure" contract every other crawl step in this codebase
// already follows.
import { fetchWithTimeout } from "@/lib/http";
import type { RawSiteSignal } from "./templates/dynamic/tokens";

const FIRECRAWL_DESIGN_TIMEOUT_MS = 15000;
const HYDRATION_WAIT_MS = 2500;
const CTA_TEXT_HINTS = /\b(book|schedule|get started|confirm|apply|start|talk to|call|contact|demo|sign up|reserve)\b/i;
const MAX_CARD_CONTAINER_SAMPLES = 40;

interface FirecrawlScrapeResponse {
  data?: {
    rawHtml?: string;
    screenshot?: string;
  };
}

async function fetchRenderedHtmlViaFirecrawl(url: string): Promise<{ rawHtml: string; screenshotUrl?: string } | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

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
          formats: ["rawHtml", { type: "screenshot", fullPage: false }],
          waitFor: HYDRATION_WAIT_MS,
          timeout: FIRECRAWL_DESIGN_TIMEOUT_MS,
        }),
      },
      FIRECRAWL_DESIGN_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FirecrawlScrapeResponse;
    const rawHtml = data?.data?.rawHtml;
    if (!rawHtml || rawHtml.length < 200) return null;
    return { rawHtml, screenshotUrl: data?.data?.screenshot };
  } catch {
    return null;
  }
}

// ── Signal extraction ────────────────────────────────────────────────────
// String-level, deliberately. Resolving a full cascade (external
// stylesheets, media queries, CSS custom property chains) is a much
// harder and flakier problem than reading the class vocabulary most
// modern site builders — Lovable included — already ship verbatim in the
// markup. Where a site doesn't use utility classes, the color/font
// extraction below still works off <style> blocks and :root variables;
// only the button/card shape signal degrades to nothing, which
// classifySiteSignal() already treats as "fall back to DEFAULT_TOKENS"
// rather than guessing.

function extractClassTokens(html: string): string[] {
  const tokens: string[] = [];

  const ctaRe = /<(a|button)\b[^>]*class="([^"]*)"[^>]*>([\s\S]{0,120}?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = ctaRe.exec(html))) {
    const classAttr = m[2];
    const innerText = m[3].replace(/<[^>]+>/g, " ");
    if (CTA_TEXT_HINTS.test(innerText)) {
      tokens.push(...classAttr.split(/\s+/).filter(Boolean));
    }
  }

  const cardRe = /<(div|section|article)\b[^>]*class="([^"]*(?:border|shadow|backdrop|rounded)[^"]*)"/gi;
  let cm: RegExpExecArray | null;
  let cardHits = 0;
  while ((cm = cardRe.exec(html)) && cardHits < MAX_CARD_CONTAINER_SAMPLES) {
    tokens.push(...cm[2].split(/\s+/).filter(Boolean));
    cardHits++;
  }

  return tokens;
}

function extractColorMentions(html: string): string[] {
  const colors: string[] = [];

  const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  if (themeColorMatch) colors.push(themeColorMatch[1]);

  const rootBlockMatch = html.match(/:root\s*{([^}]*)}/i);
  if (rootBlockMatch) {
    colors.push(...(rootBlockMatch[1].match(/#[0-9a-f]{3,8}\b/gi) ?? []));
  }

  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
  for (const block of styleBlocks.slice(0, 5)) {
    colors.push(...(block.match(/#[0-9a-f]{3,8}\b/gi) ?? []).slice(0, 20));
  }

  return colors.slice(0, 40);
}

function extractFontFamilyMentions(html: string): string[] {
  const families: string[] = [];

  const googleFontsMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/i);
  if (googleFontsMatch) {
    families.push(decodeURIComponent(googleFontsMatch[1]).replace(/\+/g, " ").split(":")[0]);
  }

  const ffRe = /font-family:\s*["']?([^;"'}]+)/gi;
  let fm: RegExpExecArray | null;
  while ((fm = ffRe.exec(html)) && families.length < 10) {
    const first = fm[1].split(",")[0].trim().replace(/["']/g, "");
    if (first && !/^(inherit|initial|unset|sans-serif|serif|monospace)$/i.test(first)) {
      families.push(first);
    }
  }

  return families;
}

function detectLooksDark(html: string): boolean {
  const rootClassMatch = html.match(/<(?:body|html)\b[^>]*class="([^"]*)"/i);
  const cls = rootClassMatch?.[1] ?? "";
  if (/\bdark\b/.test(cls)) return true;
  if (/\bbg-(black|neutral-900|neutral-950|zinc-900|zinc-950|slate-900|slate-950)\b/.test(cls)) return true;

  const colorScheme = html.match(/<meta[^>]+name=["']color-scheme["'][^>]+content=["']([^"']+)["']/i);
  if (colorScheme && /dark/i.test(colorScheme[1])) return true;

  return false;
}

export interface DesignSignalResult extends RawSiteSignal {
  /** Temporary Firecrawl-hosted URL, expires in ~24h — for the wizard's
   * "here's the site we matched" preview only, never persisted long-term. */
  screenshotUrl?: string;
}

export async function scrapeDesignSignal(domain: string): Promise<DesignSignalResult | null> {
  const base = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const fetched = await fetchRenderedHtmlViaFirecrawl(base);
  if (!fetched) return null;

  const { rawHtml, screenshotUrl } = fetched;
  return {
    classTokens: extractClassTokens(rawHtml),
    colorMentions: extractColorMentions(rawHtml),
    fontFamilyMentions: extractFontFamilyMentions(rawHtml),
    looksDark: detectLooksDark(rawHtml),
    screenshotUrl,
  };
}
