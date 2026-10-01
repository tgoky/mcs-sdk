import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const membership = vi.fn();
const session: Record<string, unknown> & { destroy: () => void; save: () => Promise<void> } = {
  destroy: vi.fn(),
  save: vi.fn(async () => {}),
};
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});

vi.mock("@/lib/whop", async (orig) => ({
  ...(await orig<typeof import("@/lib/whop")>()),
  exchangeCode: async () => ({ access_token: "at", refresh_token: "rt" }),
  getWhopUser: async () => ({ sub: "user_1", email: "a@b.com" }),
  revokeToken: async () => {},
}));
vi.mock("@/lib/whop-access", () => ({ isAdminEmail: () => false, checkActiveMembership: (...a: unknown[]) => membership(...a) }));
vi.mock("@/lib/whop-checkout", () => ({ createSignupCheckoutSession: async () => ({ sessionId: "ch_1", purchaseUrl: "" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitResponse: async () => null, clientIp: () => "1.2.3.4", RATE_LIMITS: {} }));
vi.mock("@/lib/session", async (orig) => ({ ...(await orig<typeof import("@/lib/session")>()), getSession: async () => session }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ sessionVersion: 0 }] }) }) }),
    update: () => ({ set: () => ({ where: () => ({ catch: async () => {} }) }) }),
  },
}));

import { GET as callback } from "@/app/api/auth/callback/route";
import { GET as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import CheckoutPage from "@/app/checkout/page";
import { encryptOAuthState, decryptOAuthState, OAUTH_NONCE_COOKIE } from "@/lib/oauth-state";

const secret = process.env.SESSION_SECRET!;
const active = { hasAccess: true, status: "active" };
const none = { hasAccess: false, status: "none" };

const callbackWith = (over: object) => {
  const st = encryptOAuthState({ codeVerifier: "v", redirectTo: "/home", nonce: "n", issuedAt: Date.now(), ...over }, secret);
  return callback(
    new Request(`https://app.example/api/auth/callback?code=c&state=${encodeURIComponent(st)}`, {
      headers: { cookie: `${OAUTH_NONCE_COOKIE}=n` },
    })
  );
};

beforeEach(() => {
  membership.mockReset();
  redirect.mockClear();
  for (const k of ["whopUserId", "email", "subscriptionStatus"]) delete session[k];
});

describe("sign-in right after checkout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for Whop to activate the membership, then lands on /home", async () => {
    membership.mockResolvedValueOnce(none).mockResolvedValueOnce(none).mockResolvedValue(active);
    const pending = callbackWith({ afterCheckout: true });
    await vi.runAllTimersAsync();
    const body = await (await pending).text();
    expect(membership).toHaveBeenCalledTimes(3);
    expect(body).toContain("/home");
  });

  it("tells them not to pay again if it's still not active", async () => {
    membership.mockResolvedValue(none);
    const pending = callbackWith({ afterCheckout: true });
    await vi.runAllTimersAsync();
    const body = await (await pending).text();
    expect(membership).toHaveBeenCalledTimes(4);
    expect(body).toContain("/checkout?pending=1");
  });

  it("checks once for an ordinary sign-in", async () => {
    membership.mockResolvedValue(none);
    const body = await (await callbackWith({})).text();
    expect(membership).toHaveBeenCalledTimes(1);
    expect(body).toContain("/checkout");
    expect(body).not.toContain("pending=1");
  });
});

describe("login route", () => {
  const whopUrl = async (query: string) => {
    const html = await (await login(new Request(`https://app.example/api/auth/login${query}`))).text();
    return new URL(html.match(/https:\/\/api\.whop\.com\/oauth\/authorize\?[^"'\s<]+/)![0].replace(/&amp;/g, "&"));
  };

  it("carries after_checkout into the state", async () => {
    const url = await whopUrl("?redirect_to=/home&after_checkout=1");
    expect(decryptOAuthState(url.searchParams.get("state")!, secret)?.afterCheckout).toBe(true);
  });

  it("asks Whop for its sign-in screen only when switching accounts", async () => {
    expect((await whopUrl("?switch_account=1")).searchParams.get("prompt")).toBe("login");
    expect((await whopUrl("")).searchParams.get("prompt")).toBeNull();
  });
});

describe("logout", () => {
  it("goes on to a fresh Whop sign-in when switching accounts", async () => {
    session.whopUserId = "user_1";
    const form = new FormData();
    form.set("switch_account", "1");
    const res = await logout(new Request("https://app.example/api/auth/logout", { method: "POST", body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.example/api/auth/login?switch_account=1");
    expect(session.destroy).toHaveBeenCalled();
  });
});

describe("/checkout", () => {
  const render = (params: object = {}) => CheckoutPage({ searchParams: Promise.resolve(params) });

  it("sends an active member to /home", async () => {
    Object.assign(session, { whopUserId: "user_1", subscriptionStatus: "active" });
    await expect(render()).rejects.toThrow("REDIRECT:/home");
  });

  it("refreshes a session that's behind Whop", async () => {
    Object.assign(session, { whopUserId: "user_1", subscriptionStatus: "none" });
    membership.mockResolvedValue(active);
    await expect(render()).rejects.toThrow("REDIRECT:/api/auth/refresh-membership");
  });

  it("doesn't ask Whop again once the refresh route has", async () => {
    Object.assign(session, { whopUserId: "user_1", subscriptionStatus: "none" });
    await render({ checked: "1" });
    expect(membership).not.toHaveBeenCalled();
  });

  it("shows the form to a logged-out visitor without calling Whop's membership API", async () => {
    await render();
    expect(membership).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
