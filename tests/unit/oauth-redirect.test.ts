import { describe, it, expect } from "vitest";
import { buildOAuthRedirectHtml, safeRelativePath } from "@/lib/oauth-redirect-html";

describe("sign-in redirect", () => {
  it("keeps a real path on this site, query and hash included", () => {
    expect(safeRelativePath("/dashboard/engagements/eng_1?tab=skills#top")).toBe("/dashboard/engagements/eng_1?tab=skills#top");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\\\evil.example", "https://evil.example", "evil.example", "/\tevil", "/\n//evil.example", ""]) {
      expect(safeRelativePath(bad, "/home"), JSON.stringify(bad)).toBe("/home");
    }
  });

  it("never lets the destination break out of the page", () => {
    for (const attack of ['/"><img src=x onerror=alert(1)>', "/</script><script>alert(1)</script>"]) {
      const html = buildOAuthRedirectHtml(safeRelativePath(attack, "/home")!, "Redirecting");
      expect(html).not.toMatch(/<img|<script>alert/);
      // Even an unchecked destination can't escape its attribute or script.
      const raw = buildOAuthRedirectHtml(attack, "Redirecting");
      expect(raw).not.toMatch(/<img|<\/script><script>/);
      expect(raw.match(/<script>/g)).toHaveLength(1);
    }
  });
});
