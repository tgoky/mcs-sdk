import { describe, it, expect, vi, beforeEach } from "vitest";

let returned: { count: number; windowStart: Date }[] = [];
let failing = false;
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (failing) throw new Error("connection reset");
            return returned;
          },
        }),
      }),
    }),
  },
}));

import { hitRateLimit, rateLimitResponse, clientIp } from "@/lib/rate-limit";

const rule = { name: "test", limit: 3, windowSeconds: 60 };
const now = new Date("2026-09-26T12:00:00Z");

describe("rate limits", () => {
  beforeEach(() => {
    failing = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("allows up to the limit in a window", async () => {
    returned = [{ count: 3, windowStart: new Date(now.getTime() - 10_000) }];
    expect(await hitRateLimit(rule, "u1", now)).toEqual({ allowed: true, count: 3, retryAfterSeconds: 50 });
  });

  it("refuses past the limit, saying when to retry", async () => {
    returned = [{ count: 4, windowStart: new Date(now.getTime() - 45_000) }];
    expect(await hitRateLimit(rule, "u1", now)).toEqual({ allowed: false, count: 4, retryAfterSeconds: 15 });
    const res = await rateLimitResponse(rule, "u1", "Slow down.");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
    expect(await res?.json()).toEqual({ error: "Slow down." });
  });

  it("lets requests through when it can't count, rather than breaking the app", async () => {
    failing = true;
    expect((await hitRateLimit(rule, "u1", now)).allowed).toBe(true);
    expect(await rateLimitResponse(rule, "u1")).toBeNull();
  });

  it("reads the caller's address from the proxy", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("https://x", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIp(new Request("https://x"))).toBe("unknown");
  });
});
