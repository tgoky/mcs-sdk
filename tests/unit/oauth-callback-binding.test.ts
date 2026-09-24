import { describe, it, expect, vi, beforeEach } from "vitest";

const exchange = vi.fn(async () => ({ access_token: "at", refresh_token: "rt" }));
vi.mock("@/lib/whop", () => ({ exchangeCode: (...a: unknown[]) => exchange(...(a as [])), getWhopUser: async () => ({ sub: "user_1", email: "a@b.com" }) }));
vi.mock("@/lib/whop-access", () => ({ isAdminEmail: () => false, checkActiveMembership: async () => ({ hasAccess: true, status: "active" }) }));
vi.mock("@/lib/db", () => ({ db: { insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ sessionVersion: 3 }] }) }) }) } }));

import { GET as callback } from "@/app/api/auth/callback/route";
import { encryptOAuthState, OAUTH_NONCE_COOKIE } from "@/lib/oauth-state";

const secret = process.env.SESSION_SECRET!;
const state = (over: object = {}) => encryptOAuthState({ codeVerifier: "v", redirectTo: "/home", nonce: "browser-a", issuedAt: Date.now(), ...over }, secret);
const call = (st: string, cookie?: string) =>
  callback(new Request(`https://app.example/api/auth/callback?code=c&state=${encodeURIComponent(st)}`, { headers: cookie ? { cookie } : {} }));

describe("sign-in callback", () => {
  beforeEach(() => exchange.mockClear());

  it("finishes a sign-in started in this browser", async () => {
    const res = await call(state(), `${OAUTH_NONCE_COOKIE}=browser-a`);
    expect(res.status).toBe(200);
    expect(exchange).toHaveBeenCalledOnce();
    const cookies = res.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("mudd_session=");
    expect(cookies).toContain(`${OAUTH_NONCE_COOKIE}=;`);
  });

  it("refuses a sign-in started in another browser (login CSRF), before talking to Whop", async () => {
    for (const cookie of [undefined, `${OAUTH_NONCE_COOKIE}=browser-b`]) {
      const res = await call(state(), cookie);
      expect(res.status).toBe(400);
    }
    expect(exchange).not.toHaveBeenCalled();
  });

  it("refuses an old sign-in link, and one from before the binding existed", async () => {
    expect((await call(state({ issuedAt: Date.now() - 11 * 60_000 }), `${OAUTH_NONCE_COOKIE}=browser-a`)).status).toBe(400);
    expect((await call(state({ nonce: undefined, issuedAt: undefined }), `${OAUTH_NONCE_COOKIE}=browser-a`)).status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });
});
