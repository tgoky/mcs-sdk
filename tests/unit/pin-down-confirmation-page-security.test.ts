import { describe, it, expect } from "vitest";
import { classifySiteSignal, DEFAULT_TOKENS, type RawSiteSignal } from "@/features/pin-down/server/templates/dynamic/tokens";
import {
  buildPageContentModel,
  sanitizeVideoEmbedUrl,
  buildHeroVideoBlock,
  animationBodyClass,
  buildGoogleFontLinks,
} from "@/features/pin-down/server/templates/content-model";

function signal(overrides: Partial<RawSiteSignal> = {}): RawSiteSignal {
  return {
    classTokens: ["rounded-full", "bg-blue-600", "shadow-lg", "shadow-lg"],
    colorMentions: ["#2563eb"],
    fontFamilyMentions: [],
    looksDark: false,
    ...overrides,
  };
}

describe("classifySiteSignal — fontFamily sanitization", () => {
  it("uses a real scraped font name verbatim", () => {
    const tokens = classifySiteSignal(signal({ fontFamilyMentions: ["Sora"] }));
    expect(tokens.fontFamily).toContain("Sora");
  });

  it("rejects a font-family match that carries markup instead of a font name", () => {
    const malicious = signal({
      fontFamilyMentions: ["Arial</style><script>alert(document.cookie)</script><style"],
    });
    const tokens = classifySiteSignal(malicious);
    expect(tokens.fontFamily).not.toContain("<script");
    expect(tokens.fontFamily).not.toContain("</style");
  });

  it("falls back to the default font stack when every mention is rejected", () => {
    const tokens = classifySiteSignal(signal({ fontFamilyMentions: ["</style><script>x</script>"] }));
    expect(tokens.fontFamily).toBe(DEFAULT_TOKENS.fontFamily);
  });

  it("still classifies a real serif brand font correctly after sanitization", () => {
    const tokens = classifySiteSignal(signal({ fontFamilyMentions: ["Playfair Display"] }));
    expect(tokens.typePairing).toBe("editorial-serif");
    expect(tokens.fontFamily).toContain("Playfair Display");
  });
});

describe("buildPageContentModel — calendarAddToUrl sanitization", () => {
  const baseInput = { buyer: "Acme Co" };

  it("keeps a real https calendar link, HTML-escaped", () => {
    const model = buildPageContentModel({ ...baseInput, calendarAddToUrl: "https://calendar.google.com/render?a=1&b=2" });
    expect(model.calendarAddToUrl).toBe("https://calendar.google.com/render?a=1&amp;b=2");
  });

  it("keeps a mailto link", () => {
    const model = buildPageContentModel({ ...baseInput, calendarAddToUrl: "mailto:ops@acme.com" });
    expect(model.calendarAddToUrl).toBe("mailto:ops@acme.com");
  });

  it("drops a javascript: URI instead of escaping it", () => {
    const model = buildPageContentModel({ ...baseInput, calendarAddToUrl: "javascript:alert(document.cookie)" });
    expect(model.calendarAddToUrl).toBeUndefined();
  });

  it("drops a data: URI", () => {
    const model = buildPageContentModel({ ...baseInput, calendarAddToUrl: "data:text/html,<script>alert(1)</script>" });
    expect(model.calendarAddToUrl).toBeUndefined();
  });

  it("HTML-escapes a quote character that would otherwise break out of the href attribute", () => {
    const model = buildPageContentModel({
      ...baseInput,
      calendarAddToUrl: 'https://example.com/x?a="onmouseover="alert(1)',
    });
    expect(model.calendarAddToUrl).not.toContain('"');
    expect(model.calendarAddToUrl).toContain("&quot;");
  });

  it("leaves calendarAddToUrl undefined when none was provided", () => {
    const model = buildPageContentModel(baseInput);
    expect(model.calendarAddToUrl).toBeUndefined();
  });
});

describe("sanitizeVideoEmbedUrl", () => {
  it("converts a Loom share link to its embed URL", () => {
    expect(sanitizeVideoEmbedUrl("https://www.loom.com/share/abc123DEF")).toBe(
      "https://www.loom.com/embed/abc123DEF"
    );
  });

  it("converts a youtube.com/watch link to its embed URL", () => {
    expect(sanitizeVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts a youtube.com/watch link with extra query params", () => {
    expect(sanitizeVideoEmbedUrl("https://www.youtube.com/watch?list=abc&v=dQw4w9WgXcQ&t=10s")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts a youtu.be short link to its embed URL", () => {
    expect(sanitizeVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts a vimeo.com link to its player URL", () => {
    expect(sanitizeVideoEmbedUrl("https://vimeo.com/76979871")).toBe(
      "https://player.vimeo.com/video/76979871"
    );
  });

  it("rejects an unrecognized host entirely, never echoing the raw input", () => {
    expect(sanitizeVideoEmbedUrl("https://attacker.example/embed?src=xss")).toBeUndefined();
  });

  it("rejects a javascript: URI dressed up to look like a share link", () => {
    expect(sanitizeVideoEmbedUrl("javascript:alert(1)//loom.com/share/x")).toBeUndefined();
  });

  it("strips a malicious suffix instead of embedding it — the ID capture group stops at the first non-alphanumeric character", () => {
    const result = sanitizeVideoEmbedUrl('https://www.loom.com/share/abc"><script>alert(1)</script>');
    expect(result).toBe("https://www.loom.com/embed/abc");
    expect(result).not.toContain("<script");
    expect(result).not.toContain('"');
  });

  it("returns undefined for empty/missing input", () => {
    expect(sanitizeVideoEmbedUrl(undefined)).toBeUndefined();
    expect(sanitizeVideoEmbedUrl("")).toBeUndefined();
  });
});

describe("buildHeroVideoBlock", () => {
  it("renders the placeholder verbatim when no video is set", () => {
    const html = buildHeroVideoBlock({ heroVideoUrl: undefined, placeholderHtml: "<div>placeholder</div>" });
    expect(html).toBe("<div>placeholder</div>");
  });

  it("renders an iframe pointed at the given (already-sanitized) embed URL", () => {
    const html = buildHeroVideoBlock({
      heroVideoUrl: "https://www.loom.com/embed/abc123",
      placeholderHtml: "<div>placeholder</div>",
    });
    expect(html).toContain('src="https://www.loom.com/embed/abc123"');
    expect(html).not.toContain("placeholder");
  });
});

describe("buildPageContentModel — heroVideoUrl sanitization end to end", () => {
  it("keeps a real Loom link, converted to its embed form", () => {
    const model = buildPageContentModel({ buyer: "Acme Co", heroVideoUrl: "https://www.loom.com/share/abc123DEF" });
    expect(model.heroVideoUrl).toBe("https://www.loom.com/embed/abc123DEF");
  });

  it("drops an unrecognized/malicious video URL", () => {
    const model = buildPageContentModel({
      buyer: "Acme Co",
      heroVideoUrl: 'https://evil.example/x"><script>alert(1)</script>',
    });
    expect(model.heroVideoUrl).toBeUndefined();
  });

  it("leaves heroVideoUrl undefined when none was provided", () => {
    const model = buildPageContentModel({ buyer: "Acme Co" });
    expect(model.heroVideoUrl).toBeUndefined();
  });
});

describe("buildPageContentModel — animationsEnabled (opt-in only)", () => {
  it("defaults to false when the caller doesn't pass it", () => {
    const model = buildPageContentModel({ buyer: "Acme Co" });
    expect(model.animationsEnabled).toBe(false);
  });

  it("stays false for any non-true value rather than being merely truthy", () => {
    const model = buildPageContentModel({ buyer: "Acme Co", animationsEnabled: undefined });
    expect(model.animationsEnabled).toBe(false);
  });

  it("turns true only when explicitly opted in", () => {
    const model = buildPageContentModel({ buyer: "Acme Co", animationsEnabled: true });
    expect(model.animationsEnabled).toBe(true);
  });
});

describe("animationBodyClass", () => {
  it("returns the animation class when enabled", () => {
    const model = buildPageContentModel({ buyer: "Acme Co", animationsEnabled: true });
    expect(animationBodyClass(model)).toBe("pd-anim");
  });

  it("returns an empty string when disabled, so <body class=\"\"> renders inert", () => {
    const model = buildPageContentModel({ buyer: "Acme Co" });
    expect(animationBodyClass(model)).toBe("");
  });
});

describe("buildGoogleFontLinks", () => {
  it("builds preconnect hints plus a stylesheet link carrying the exact families query", () => {
    const html = buildGoogleFontLinks("family=Inter:wght@400;500;600");
    expect(html).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
    expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com"');
    expect(html).toContain("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");
  });
});
