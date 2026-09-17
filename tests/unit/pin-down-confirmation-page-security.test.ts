import { describe, it, expect } from "vitest";
import { classifySiteSignal, DEFAULT_TOKENS, type RawSiteSignal } from "@/features/pin-down/server/templates/dynamic/tokens";
import { buildPageContentModel } from "@/features/pin-down/server/templates/content-model";

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
