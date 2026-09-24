import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ callClaudeWithRetry: vi.fn(), MODEL: { SYNTHESIS: "SYNTHESIS", FAST: "FAST" } }));
vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));
// Page reads go through safeFetch (public addresses only); here it hands
// straight to the same mocked fetch.
vi.mock("@/lib/safe-fetch", async () => {
  const { fetchWithTimeout } = await import("@/lib/http");
  return { safeFetch: (url: string, init?: RequestInit) => fetchWithTimeout(url, init) };
});
vi.mock("@/features/pin-down/server/voice-scraper", () => ({ crawlSite: vi.fn() }));
vi.mock("@/features/pin-down/server/design-scraper", () => ({
  designSignalFromHtml: vi.fn(() => ({ classTokens: [], colorMentions: ["#123456"], fontFamilyMentions: [], looksDark: false })),
  scrapeDesignSignal: vi.fn(),
}));

import { callClaudeWithRetry } from "@/lib/llm";
import { fetchWithTimeout } from "@/lib/http";
import { crawlSite } from "@/features/pin-down/server/voice-scraper";
import { scrapeDesignSignal } from "@/features/pin-down/server/design-scraper";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";

const HOME = `<html><head><title>Upse | Coaching</title></head><body>
  <a href="https://www.instagram.com/upse">IG</a>
  <script src="//js.hs-scripts.com/1.js"></script>
  <a href="https://calendly.com/upse/strategy-call">Book</a>
</body></html>`;
const LONG_FILLER = "Real marketing copy about the program. ".repeat(300); // ~11k characters
const PRICING = `[pricing_page https://upse.com/pricing]\nScale Sprint is $2,500. "Dana doubled our close rate in six weeks," says Sam Lee, Founder of Acme.`;

function response(body: string, ok = true) {
  return { ok, status: ok ? 200 : 404, text: async () => body, json: async () => ({}), headers: new Headers({ "content-type": "text/html" }) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(crawlSite).mockResolvedValue({
    corpus: `[marketing_site https://upse.com]\n${LONG_FILLER}\n\n---\n\n${PRICING}`,
    sources: [
      { kind: "marketing_site", url: "https://upse.com", wordCount: 1500, text: LONG_FILLER, html: HOME, links: ["https://www.instagram.com/upse"] },
      { kind: "pricing_page", url: "https://upse.com/pricing", wordCount: 30, text: PRICING, html: "<p>pricing</p>" },
    ],
    homepageHtml: HOME,
  });
  // Every probed path answers with the homepage, as many sites do.
  vi.mocked(fetchWithTimeout).mockImplementation(async () => response(HOME + "x".repeat(600)));
  vi.mocked(callClaudeWithRetry).mockResolvedValue({
    text: JSON.stringify({
      buyer_name: "Upse",
      offer_name: "Scale Sprint",
      offer_price: "$2,500",
      testimonials: [
        { quote: "Dana doubled our close rate in six weeks,", name: "Sam Lee", role: "Founder", company: "Acme" },
        { quote: "Best coach I've ever worked with, full stop.", name: "Made Up", role: "CEO" },
      ],
      faqs: [{ question: "Is this for me?", answer: "Yes." }],
      objections: ["Is it worth $2,500?"],
      offers: [{ name: "Scale Sprint", price: "$2,500" }],
    }),
  } as never);
});

describe("runDiscoveryPrefill", () => {
  it("has Claude read the whole crawl, including pages past the first 6,000 characters", async () => {
    await runDiscoveryPrefill("upse.com");
    const sent = vi.mocked(callClaudeWithRetry).mock.calls[0][0].userMessage;
    expect(sent).toContain("Scale Sprint is $2,500");
    expect(sent.length).toBeGreaterThan(6000);
  });

  it("keeps only testimonials that are really on the site", async () => {
    const out = await runDiscoveryPrefill("upse.com");
    expect(out.deep?.testimonials.map((t) => t.name)).toEqual(["Sam Lee"]);
    // An FAQ question that isn't on any page is dropped too.
    expect(out.deep?.faqs).toEqual([]);
  });

  it("reads the free signals from the crawled HTML without another paid design call", async () => {
    const out = await runDiscoveryPrefill("upse.com");
    expect(out.deep?.socialProfiles.instagram).toBe("https://www.instagram.com/upse");
    expect(out.deep?.techStack.emailCrm).toEqual(["hubspot"]);
    expect(out.deep?.bookingLinks[0]).toMatchObject({ platform: "calendly", event: "strategy-call" });
    expect(out.detectedBookingPlatform).toBe("calendly");
    expect(out.designSignal).toBeTruthy();
    expect(scrapeDesignSignal).not.toHaveBeenCalled();
  });

  it("doesn't mistake a site that answers every address with its homepage for having a confirmation page", async () => {
    const out = await runDiscoveryPrefill("upse.com");
    expect(out.existingConfirmationPageUrl).toBeUndefined();
  });

  it("finds a real confirmation page that differs from the fallback and reads like one", async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) =>
      String(url).endsWith("/thank-you")
        ? response(`<html><head><title>You're booked</title></head><body>${"<p>You're booked! Here's what to expect before your call.</p>".repeat(20)}</body></html>`)
        : response(HOME + "x".repeat(600))
    );
    const out = await runDiscoveryPrefill("upse.com");
    expect(out.existingConfirmationPageUrl).toBe("https://upse.com/thank-you");
  });
});
