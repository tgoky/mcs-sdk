import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkWebhookToken, webhookUrl, webhookUrlToken } from "@/lib/webhook-url-token";

const BEFORE_GRACE_END = Date.parse("2026-10-01T00:00:00Z");
const AFTER_GRACE_END = Date.parse("2026-11-01T00:00:00Z");

describe("webhook address tokens", () => {
  it("builds a per-client address and accepts only that client's token", () => {
    const url = webhookUrl("https://app.example/", "inbound-reply", "eng_a");
    expect(url).toMatch(/^https:\/\/app\.example\/api\/webhooks\/inbound-reply\/eng_a\?token=[\w-]{32}$/);
    expect(checkWebhookToken("eng_a", url, AFTER_GRACE_END)).toBe("valid");
    // Another client's token, or a made-up one, is refused.
    expect(checkWebhookToken("eng_b", url, BEFORE_GRACE_END)).toBe("rejected");
    expect(checkWebhookToken("eng_a", "https://app.example/x?token=guess", BEFORE_GRACE_END)).toBe("rejected");
    expect(webhookUrlToken("eng_a")).not.toBe(webhookUrlToken("eng_b"));
  });

  it("lets an old address without a token through only until the grace date", () => {
    expect(checkWebhookToken("eng_a", "https://app.example/api/webhooks/inbound-reply/eng_a", BEFORE_GRACE_END)).toBe("legacy");
    expect(checkWebhookToken("eng_a", "https://app.example/api/webhooks/inbound-reply/eng_a", AFTER_GRACE_END)).toBe("rejected");
  });
});

// A delivery feed with no signature of its own (ConvertKit): the token is the gate.
const recorded: string[] = [];
const paused: string[] = [];
const notices: string[] = [];
vi.mock("@/lib/db", () => {
  const chain = () => ({ from: () => ({ where: () => ({ limit: async () => [{ stack: { email_platform: "convertkit" } }] }) }) });
  return { db: { select: chain, insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "claim" }] }) }) }), delete: () => ({ where: async () => {} }) } };
});
vi.mock("@/lib/esp-delivery-events", () => ({ recordDeliveryEvent: async (_e: string, _p: string, kind: string) => void recorded.push(kind) }));
vi.mock("@/features/win-back/server/esp-delivery-monitor", () => ({ checkAndApplyAutoPause: async (e: string) => void paused.push(e) }));
vi.mock("@/lib/webhook-legacy-notice", () => ({ noticeLegacyWebhookAddress: async (e: string) => void notices.push(e) }));
vi.mock("@/lib/after-response", () => ({ afterResponse: (fn: () => Promise<unknown>) => void fn() }));

import { POST as convertkit } from "@/app/api/webhooks/convertkit-delivery/[engagementId]/route";

const complaint = (url: string) =>
  convertkit(new Request(url, { method: "POST", body: JSON.stringify({ event: "subscriber.subscriber_complain", subscriber: { email_address: "x@y.com" } }) }), { params: Promise.resolve({ engagementId: "eng_a" }) });

describe("ConvertKit bounce and complaint feed", () => {
  beforeEach(() => {
    recorded.length = paused.length = notices.length = 0;
    vi.useRealTimers();
  });

  it("acts on a complaint sent to the address with the right token", async () => {
    const res = await complaint(webhookUrl("https://app.example", "convertkit-delivery", "eng_a"));
    expect(res.status).toBe(200);
    expect(recorded).toEqual(["complained"]);
    expect(paused).toEqual(["eng_a"]);
  });

  it("refuses a wrong token, and a missing one after the grace date", async () => {
    expect((await complaint("https://app.example/api/webhooks/convertkit-delivery/eng_a?token=forged")).status).toBe(401);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AFTER_GRACE_END);
    expect((await complaint("https://app.example/api/webhooks/convertkit-delivery/eng_a")).status).toBe(401);
    expect(recorded).toEqual([]);
    expect(paused).toEqual([]);
  });

  it("during the grace period, acknowledges an old address but records nothing and tells the owner", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BEFORE_GRACE_END);
    const res = await complaint("https://app.example/api/webhooks/convertkit-delivery/eng_a");
    expect(res.status).toBe(200);
    expect(recorded).toEqual([]);
    expect(paused).toEqual([]);
    expect(notices).toEqual(["eng_a"]);
  });
});
