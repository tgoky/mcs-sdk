import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: unknown[] = [];
const bounces: string[] = [];
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ engagementId: "eng_a", stack: { inbound_reply_mode: "forwarding", email_platform: "smtp" } }] }) }) }) } }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: async (e: unknown) => void sent.push(e) }, inboundReplyReceived: { create: (d: unknown) => d } }));
vi.mock("@/lib/esp-delivery-events", () => ({ recordDeliveryEvent: async (_e: string, _p: string, k: string) => void bounces.push(k) }));
vi.mock("@/features/win-back/server/esp-delivery-monitor", () => ({ checkAndApplyAutoPause: async () => {} }));
vi.mock("@/lib/webhook-legacy-notice", () => ({ noticeLegacyWebhookAddress: async () => {} }));
vi.mock("@/lib/after-response", () => ({ afterResponse: () => {} }));

import { POST } from "@/app/api/webhooks/inbound-reply/[engagementId]/route";
import { webhookUrl } from "@/lib/webhook-url-token";

const post = (url: string, body: object) =>
  POST(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ engagementId: "eng_a" }) });
const reply = { From: "lead@acme.com", Subject: "Re: hello", TextBody: "Sounds good, let's talk." };
const bounce = { From: "MAILER-DAEMON@mail.example", Subject: "Undelivered Mail Returned to Sender", TextBody: "Delivery to the following recipient failed permanently: lead@acme.com" };

describe("reply catcher", () => {
  beforeEach(() => {
    sent.length = bounces.length = 0;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-01T00:00:00Z"));
  });

  it("takes replies and bounces at the address with the token", async () => {
    const url = webhookUrl("https://app.example", "inbound-reply", "eng_a");
    expect((await post(url, reply)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await post(url, bounce)).status).toBe(200);
    expect(bounces).toEqual(["bounced"]);
  });

  it("refuses a wrong token", async () => {
    expect((await post("https://app.example/api/webhooks/inbound-reply/eng_a?token=forged", reply)).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("during the grace period, still delivers a reply to an old address but won't take its bounces", async () => {
    const old = "https://app.example/api/webhooks/inbound-reply/eng_a";
    expect((await post(old, reply)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await post(old, bounce)).status).toBe(200);
    expect(bounces).toEqual([]);
  });
});
