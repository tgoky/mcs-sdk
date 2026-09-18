import { describe, it, expect } from "vitest";
import { wrapAsEmbeddableIframe, publishConfirmationPage, type ConfirmationPageContent } from "@/lib/platforms/hosting";

function content(overrides: Partial<ConfirmationPageContent> = {}): ConfirmationPageContent {
  return {
    title: "You're confirmed — Acme Co",
    html: '<!doctype html><html><head><style>body{background:#000}</style></head><body>hi</body></html>',
    ...overrides,
  };
}

describe("wrapAsEmbeddableIframe", () => {
  it("wraps the full document in a full-bleed srcdoc iframe", () => {
    const out = wrapAsEmbeddableIframe("<p>hello</p>", "My Title");
    expect(out).toContain("<iframe srcdoc=");
    expect(out).toContain("<p>hello</p>");
    expect(out).toContain('title="My Title"');
    expect(out).toContain("width:100%");
  });

  it("escapes double quotes in the source html so the srcdoc attribute can't be broken out of", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const out = wrapAsEmbeddableIframe(malicious, "T");
    expect(out).not.toContain('onerror="alert(1)"');
    expect(out).toContain("onerror=&quot;alert(1)&quot;");
  });

  it("escapes bare ampersands so entities in the source html aren't double-unescaped", () => {
    const out = wrapAsEmbeddableIframe("Q&A", "T");
    expect(out).toContain("Q&amp;A");
  });
});

describe("publishConfirmationPage — embed isolation by platform", () => {
  it("wraps webflow's paste-ready fallback (missing credentials) in an isolated iframe", async () => {
    const result = await publishConfirmationPage("webflow", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<iframe srcdoc=");
    }
  });

  it("wraps wordpress's paste-ready fallback (missing credentials) in an isolated iframe", async () => {
    const result = await publishConfirmationPage("wordpress", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<iframe srcdoc=");
    }
  });

  it("wraps ghl (no API path at all) in an isolated iframe", async () => {
    const result = await publishConfirmationPage("ghl", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<iframe srcdoc=");
    }
  });

  it("wraps an unrecognized platform by default, since embedding into an existing page is the more common shape", async () => {
    const result = await publishConfirmationPage("some_future_platform", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<iframe srcdoc=");
    }
  });

  it("keeps plain_html as a raw full document — it's a real static-file deploy, not a DOM paste", async () => {
    const result = await publishConfirmationPage("plain_html", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<!doctype html>");
      expect(result.html).not.toContain("<iframe srcdoc=");
    }
  });

  it("keeps lovable as a raw full document — an AI reads it as source, not a literal DOM paste", async () => {
    const result = await publishConfirmationPage("lovable", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<!doctype html>");
      expect(result.html).not.toContain("<iframe srcdoc=");
    }
  });

  it("keeps nextjs_vercel's paste-ready fallback (missing token) as a raw full document", async () => {
    const result = await publishConfirmationPage("nextjs_vercel", null, undefined, content(), "slug");
    expect(result.mode).toBe("paste_ready");
    if (result.mode === "paste_ready") {
      expect(result.html).toContain("<!doctype html>");
      expect(result.html).not.toContain("<iframe srcdoc=");
    }
  });
});
