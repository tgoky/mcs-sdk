import { describe, it, expect, vi, beforeEach } from "vitest";
import { sealData } from "iron-session";
import { NextRequest } from "next/server";

const membership = vi.fn(async () => ({ hasAccess: true, status: "active" }));
vi.mock("@/lib/whop-access", () => ({ checkActiveMembership: () => membership() }));
const version = { v: 0 };
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ v: version.v }] }) }) }) } }));

import { middleware } from "@/middleware";

const password = process.env.SESSION_SECRET!;
async function request(path: string, session?: Record<string, unknown>) {
  const headers = new Headers();
  if (session) headers.set("cookie", `mudd_session=${await sealData(session, { password })}`);
  return middleware(new NextRequest(`https://app.example${path}`, { headers }));
}
const fresh = { whopUserId: "u1", email: "a@b.com", subscriptionStatus: "active", subscriptionVerifiedAt: Date.now(), sessionVersion: 0 };

describe("middleware on /api", () => {
  beforeEach(() => {
    version.v = 0;
    membership.mockClear();
  });

  it("answers 401 in JSON when signed out, rather than redirecting", async () => {
    const res = await request("/api/engagements/eng_1");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("answers 402 when the membership isn't active", async () => {
    const res = await request("/api/engagements/eng_1", { ...fresh, subscriptionStatus: "inactive" });
    expect(res.status).toBe(402);
  });

  it("lets an active member through", async () => {
    const res = await request("/api/engagements/eng_1", fresh);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves webhooks, crons, sign-in and Inngest to their own checks", async () => {
    for (const path of ["/api/webhooks/inbound-reply/eng_1", "/api/crons/stale-run-reaper", "/api/auth/login", "/api/inngest", "/api/slack/interactions", "/api/recall"]) {
      const res = await request(path);
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("ends a session signed out elsewhere, at the next recheck", async () => {
    version.v = 1;
    const res = await request("/api/engagements/eng_1", { ...fresh, subscriptionVerifiedAt: 0 });
    expect(res.status).toBe(401);
    // Current sessions carry on.
    version.v = 0;
    expect((await request("/api/engagements/eng_1", { ...fresh, subscriptionVerifiedAt: 0 })).status).toBe(200);
  });

  it("stops a lapsed member at the next recheck", async () => {
    membership.mockResolvedValueOnce({ hasAccess: false, status: "inactive" });
    const res = await request("/api/engagements/eng_1", { ...fresh, subscriptionVerifiedAt: 0 });
    expect(res.status).toBe(402);
  });
});
