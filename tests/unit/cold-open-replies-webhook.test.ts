import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { missingPlaceholders } from "@/features/cold-open/server/esp/base";
import { parseReplyWebhook, isReplyEvent, stripHtml } from "@/features/cold-open/server/replies/webhook";

describe("campaign placeholders", () => {
  const step = (subject: string, body: string) => ({ subjects: [subject], bodies: [body] });

  it("passes a campaign that sends what Cold Open writes", () => {
    expect(missingPlaceholders([step("{{subject}}", "{{body1}}"), step("", "{{ body2 }}"), step("", "Hi, {{body3}}")])).toEqual([]);
  });

  it("says exactly which placeholders are missing", () => {
    expect(missingPlaceholders([step("Quick question", "Hi {{firstName}}"), step("", "{{body2}}"), step("", "hand-written follow-up")])).toEqual([
      "{{subject}} isn't in the subject line of email 1",
      "{{body1}} isn't in the body of email 1",
      "{{body3}} isn't in the body of email 3",
    ]);
  });

  it("flags a campaign with fewer than three emails", () => {
    expect(missingPlaceholders([step("{{subject}}", "{{body1}}")])).toEqual(["the campaign has 1 email step; Cold Open writes 3"]);
  });

  it("accepts the placeholder in any A/B variant", () => {
    expect(missingPlaceholders([{ subjects: ["A", "{{subject}}"], bodies: ["x", "{{body1}}"] }, step("", "{{body2}}"), step("", "{{body3}}")])).toEqual([]);
  });
});

describe("reply webhooks", () => {
  const at = new Date("2026-09-26T12:00:00Z");

  it("reads Instantly's reply_received", () => {
    const r = parseReplyWebhook({ event_type: "reply_received", timestamp: "2026-09-26T11:59:00Z", campaign_id: "c-1", campaign_name: "Agency owners", lead_email: "Jo@Acme.com", reply_subject: "Re: quick q", reply_text: "Sounds good, send times" }, at);
    expect(r).toEqual({ reply: { leadEmail: "jo@acme.com", bodyText: "Sounds good, send times", subject: "Re: quick q", campaignId: "c-1", replyId: expect.stringMatching(/^wh:/) } });
  });

  it("reads Smartlead's EMAIL_REPLY, using its message id to recognise retries", () => {
    const payload = { event_type: "EMAIL_REPLY", campaign_id: 42, lead: { email: "sam@b.io", first_name: "Sam" }, reply: { body: "Interested. What's the price?", received_at: "2026-09-26T10:00:00Z", message_id: "<m1@b.io>" } };
    const r = parseReplyWebhook(payload, at);
    expect(r).toMatchObject({ reply: { leadEmail: "sam@b.io", bodyText: "Interested. What's the price?", replyId: "wh:<m1@b.io>" } });
    expect(parseReplyWebhook(payload, new Date())).toEqual(r);
  });

  it("falls back to the reply's HTML when there's no plain text", () => {
    const r = parseReplyWebhook({ event_type: "reply_received", lead_email: "a@b.co", reply_html: "<p>Yes please</p><p>Thursday works</p>" }, at);
    expect(r).toMatchObject({ reply: { bodyText: "Yes please\nThursday works" } });
  });

  it("gives the same id to a retried delivery without a tool id", () => {
    const p = { type: "emailsReplied", leadEmail: "x@y.com", text: "ok", date: "2026-09-26T09:00:00Z" };
    const a = parseReplyWebhook(p, at);
    const b = parseReplyWebhook(p, new Date("2026-09-27T00:00:00Z"));
    expect("reply" in a && "reply" in b && a.reply.replyId === b.reply.replyId).toBe(true);
  });

  it("ignores events that aren't replies, and payloads it can't read", () => {
    expect(parseReplyWebhook({ event_type: "email_opened", lead_email: "a@b.co" }, at)).toEqual({ ignored: "not a reply event (email_opened)" });
    expect(parseReplyWebhook({ event_type: "lead_meeting_booked", lead_email: "a@b.co" }, at)).toMatchObject({ ignored: expect.any(String) });
    expect(parseReplyWebhook({ event_type: "reply_received", reply_text: "hi" }, at)).toEqual({ ignored: "no lead email in the payload" });
    expect(parseReplyWebhook({ event_type: "reply_received", lead_email: "a@b.co" }, at)).toEqual({ ignored: "no reply text in the payload" });
    expect(parseReplyWebhook("nope", at)).toEqual({ ignored: "not a JSON object" });
    expect(isReplyEvent("auto_reply_received")).toBe(false);
  });

  it("strips HTML to readable text", () => {
    expect(stripHtml("<div>Hi&nbsp;there<br>Line 2</div><style>x{}</style>")).toBe("Hi there\nLine 2");
  });
});

// ── The endpoint ────────────────────────────────────────────────────────

const storeColdOpenReply = vi.fn(async () => ({ status: "stored", id: "r1", disposition: "interested" }));
vi.mock("@/features/cold-open/server/reply-sort", () => ({ storeColdOpenReply: (...a: unknown[]) => (storeColdOpenReply as (...x: unknown[]) => unknown)(...a) }));
let config: Record<string, unknown> | null = { productIdentity: { name: "Acme" } };
vi.mock("@/features/cold-open/server/config", () => ({ getColdOpenConfig: async () => config }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitResponse: async () => null, RATE_LIMITS: { inboundReply: {} } }));

describe("cold open reply endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEBHOOK_URL_SECRET", "s");
    config = { productIdentity: { name: "Acme" } };
  });

  async function post(body: unknown, withToken = true) {
    const { webhookUrl } = await import("@/lib/webhook-url-token");
    const url = withToken ? webhookUrl("https://app.example.com", "cold-open-replies", "e1") : "https://app.example.com/api/webhooks/cold-open-replies/e1";
    const { POST } = await import("@/app/api/webhooks/cold-open-replies/[engagementId]/route");
    return POST(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ engagementId: "e1" }) });
  }

  it("sorts and stores a reply the same way a polled one is", async () => {
    const res = await post({ event_type: "reply_received", lead_email: "jo@acme.com", reply_text: "Interested" });
    expect(await res.json()).toEqual({ success: true, disposition: "interested" });
    expect(storeColdOpenReply).toHaveBeenCalledWith("e1", expect.objectContaining({ leadEmail: "jo@acme.com", bodyText: "Interested" }), { name: "Acme" });
  });

  it("rejects an address without the client's token", async () => {
    expect((await post({ event_type: "reply_received" }, false)).status).toBe(401);
    expect(storeColdOpenReply).not.toHaveBeenCalled();
  });

  it("acknowledges and skips what it can't use", async () => {
    expect(await (await post({ event_type: "email_opened", lead_email: "a@b.co" })).json()).toMatchObject({ success: true, ignored: expect.any(String) });
    config = null;
    expect(await (await post({ event_type: "reply_received", lead_email: "a@b.co", reply_text: "x" })).json()).toMatchObject({ ignored: "Cold Open isn't set up for this client." });
    expect(storeColdOpenReply).not.toHaveBeenCalled();
  });
});
