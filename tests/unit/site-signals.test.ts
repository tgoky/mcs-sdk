import { describe, it, expect } from "vitest";
import {
  detectTechStack,
  extractBookingLinks,
  extractContactAndBrand,
  extractJsonLd,
  extractSocialProfiles,
} from "@/features/pin-down/server/site-signals";

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("extractJsonLd", () => {
  it("reads the business, its offers with prices, its FAQ, its rating and its founder, through @graph", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: "Upse",
          logo: { "@type": "ImageObject", url: "https://upse.com/logo.png" },
          sameAs: ["https://instagram.com/upse"],
          telephone: "+1 555 0100",
          founder: { "@type": "Person", name: "Dana Kim" },
        },
        { "@type": "Service", name: "Scale Sprint", offers: { "@type": "Offer", price: "2500", priceCurrency: "USD" }, aggregateRating: { ratingValue: "4.9", reviewCount: "132" } },
        {
          "@type": "FAQPage",
          mainEntity: [{ "@type": "Question", name: "How long is the program?", acceptedAnswer: { "@type": "Answer", text: "<p>12 weeks.</p>" } }],
        },
      ],
    });
    const out = extractJsonLd(html);
    expect(out.organizationName).toBe("Upse");
    expect(out.logoUrl).toBe("https://upse.com/logo.png");
    expect(out.telephone).toBe("+1 555 0100");
    expect(out.offers).toEqual([{ name: "Scale Sprint", price: "2500", currency: "USD" }]);
    expect(out.faqs).toEqual([{ question: "How long is the program?", answer: "12 weeks." }]);
    expect(out.rating).toEqual({ value: 4.9, count: 132 });
    expect(out.people).toContainEqual({ name: "Dana Kim", jobTitle: "Founder" });
    expect(out.sameAs).toEqual(["https://instagram.com/upse"]);
  });

  it("skips broken blocks instead of failing", () => {
    expect(extractJsonLd(`<script type="application/ld+json">{not json</script>`).offers).toEqual([]);
  });
});

describe("extractSocialProfiles", () => {
  it("finds profiles across networks and ignores share buttons and posts", () => {
    const out = extractSocialProfiles([
      "https://www.instagram.com/upse.co/",
      "https://www.instagram.com/p/Cxyz123/",
      "https://www.facebook.com/sharer/sharer.php?u=x",
      "https://www.facebook.com/upseco",
      "https://x.com/intent/tweet?text=hi",
      "https://x.com/upse",
      "https://www.tiktok.com/@upse",
      "https://www.youtube.com/watch?v=abc",
      "https://www.youtube.com/@upse",
      "https://www.trustpilot.com/review/upse.com",
      "https://www.skool.com/upse-community",
    ]);
    expect(out).toEqual({
      instagram: "https://www.instagram.com/upse.co",
      facebook: "https://www.facebook.com/upseco",
      twitter: "@upse",
      tiktok: "https://www.tiktok.com/@upse",
      youtube: "https://www.youtube.com/@upse",
      trustpilot: "https://www.trustpilot.com/review/upse.com",
      skool: "https://www.skool.com/upse-community",
    });
  });

  it("prefers the company LinkedIn page and the link the site uses most", () => {
    const out = extractSocialProfiles([
      "https://www.linkedin.com/in/dana-kim",
      "https://www.linkedin.com/company/upse",
      "https://www.instagram.com/old_handle",
      "https://www.instagram.com/upse",
      "https://www.instagram.com/upse",
    ]);
    expect(out.linkedin).toBe("https://www.linkedin.com/company/upse");
    expect(out.instagram).toBe("https://www.instagram.com/upse");
  });
});

describe("extractBookingLinks", () => {
  it("finds booking links with their account and event, and ignores scripts", () => {
    const html = `
      <a href="https://calendly.com/upse/strategy-call?utm_source=site">Book</a>
      <script src="https://assets.calendly.com/assets/external/widget.js"></script>
      <div data-url="https://calendly.com/upse/onboarding"></div>
      <a href="https://cal.com/dana/intro">Intro</a>`;
    expect(extractBookingLinks(html)).toEqual([
      { platform: "calendly", url: "https://calendly.com/upse/strategy-call", account: "upse", event: "strategy-call" },
      { platform: "calendly", url: "https://calendly.com/upse/onboarding", account: "upse", event: "onboarding" },
      { platform: "cal_com", url: "https://cal.com/dana/intro", account: "dana", event: "intro" },
    ]);
  });
});

describe("detectTechStack", () => {
  it("ranks a script that runs on every page above a one-off, per group", () => {
    const withHubspot = `<script src="//js.hs-scripts.com/123.js"></script><script src="https://connect.facebook.net/en_US/fbevents.js"></script>`;
    const withKlaviyo = `<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>`;
    const stack = detectTechStack([withHubspot, withHubspot + `<script src="https://t.hyros.com/v1/lst/universal-script"></script>`, withKlaviyo]);
    expect(stack.emailCrm).toEqual(["hubspot", "klaviyo"]);
    expect(stack.adPixels).toEqual(["meta"]);
    expect(stack.attribution).toEqual(["hyros"]);
  });
});

describe("extractContactAndBrand", () => {
  it("reads contact links, share image and site name", () => {
    const html = `<meta property="og:image" content="/og.png"><meta property="og:site_name" content="Upse">
      <a href="mailto:hello@upse.com">Email</a><a href="tel:+1 555 0100">Call</a>
      <link rel="apple-touch-icon" href="/icon.png">`;
    expect(extractContactAndBrand(html, "https://upse.com")).toMatchObject({
      emails: ["hello@upse.com"],
      phones: ["+15550100"],
      ogImage: "https://upse.com/og.png",
      logoUrl: "https://upse.com/icon.png",
      siteName: "Upse",
    });
  });
});
