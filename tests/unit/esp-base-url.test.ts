import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn() }));

import { espApiBase, espBaseUrlProblem, upstreamErrorReason, ESPError } from "@/features/cold-open/server/esp/base";
import { normalizeLeadDomain } from "@/features/cold-open/server/business-status";

describe("ESP base URL", () => {
  it("uses the platform's own API when none is configured", () => {
    expect(espApiBase("instantly", undefined)).toBe("https://api.instantly.ai/api/v2");
  });

  it("accepts a base on the platform's own host", () => {
    expect(espBaseUrlProblem("smartlead", "https://server.smartlead.ai/api/v1/")).toBeNull();
    expect(espApiBase("smartlead", "https://server.smartlead.ai/api/v1/")).toBe("https://server.smartlead.ai/api/v1");
  });

  it("refuses any other host, so the stored key can't be sent elsewhere", () => {
    expect(espBaseUrlProblem("instantly", "https://attacker.example/api")).toMatch(/must be on https:\/\/api\.instantly\.ai/);
    expect(espBaseUrlProblem("lemlist", "http://api.lemlist.com/api")).not.toBeNull();
    expect(() => espApiBase("reply_io", "https://api.reply.io.evil.com/v1")).toThrow(ESPError);
  });

  it("reports a provider's message but never echoes the raw body", () => {
    expect(upstreamErrorReason('{"message":"Invalid API key"}')).toBe(": Invalid API key");
    expect(upstreamErrorReason("<html>secret stuff</html>")).toBe("");
  });
});

describe("normalizeLeadDomain", () => {
  it("reduces a URL to its host", () => {
    expect(normalizeLeadDomain("https://www.Acme.com/about?x=1")).toBe("www.acme.com");
    expect(normalizeLeadDomain("acme.co.uk")).toBe("acme.co.uk");
  });

  it("rejects IPs, ports, and single-label names", () => {
    expect(normalizeLeadDomain("169.254.169.254")).toBeNull();
    expect(normalizeLeadDomain("localhost")).toBeNull();
    expect(normalizeLeadDomain("acme.com:8080")).toBeNull();
  });
});
