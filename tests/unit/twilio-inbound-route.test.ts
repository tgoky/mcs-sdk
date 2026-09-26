import { describe, it, expect, vi, beforeEach } from "vitest";

let tenant: { stack: Record<string, unknown> } | undefined;
let inserted: { values: Record<string, unknown> }[] = [];
let conflict = false;
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (tenant ? [tenant] : []) }) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push({ values: v });
        return { onConflictDoNothing: () => ({ returning: async () => (conflict ? [] : [{ id: "r1" }]) }) };
      },
    }),
  },
}));
vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn(async () => "auth-token") }));
const send = vi.fn(async () => undefined);
vi.mock("@/lib/inngest", () => ({ inngest: { send: (...a: unknown[]) => (send as (...x: unknown[]) => Promise<void>)(...a) }, smsReplyReceived: { create: (d: unknown) => ({ name: "sms/reply-received", data: d }) } }));
vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));

import { POST } from "@/app/api/webhooks/twilio-inbound/[engagementId]/route";
import { twilioSignature } from "@/lib/delivery-receipts";
import { webhookUrl } from "@/lib/webhook-url-token";

const APP = "https://app.example.com";

function call(fields: Record<string, string>, signed = true) {
  const url = webhookUrl(APP, "twilio-inbound", "e1");
  const req = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(signed ? { "x-twilio-signature": twilioSignature("auth-token", url, fields) } : {}) },
    body: new URLSearchParams(fields).toString(),
  });
  return POST(req, { params: Promise.resolve({ engagementId: "e1" }) });
}

describe("Twilio incoming texts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEBHOOK_URL_SECRET", "s");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
    tenant = { stack: { sms_platform: "twilio" } };
    inserted = [];
    conflict = false;
  });

  it("stores a signed reply once and hands it to the sorter, answering Twilio with empty TwiML", async () => {
    const res = await call({ MessageSid: "SM9", From: "+15551234567", To: "+15550000000", Body: "can we move to 3pm?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/xml");
    expect(await res.text()).toContain("<Response></Response>");
    expect(inserted[0].values).toMatchObject({ engagementId: "e1", fromPhone: "+15551234567", body: "can we move to 3pm?", providerMessageId: "SM9" });
    expect(send).toHaveBeenCalledWith({ name: "sms/reply-received", data: { engagementId: "e1", replyId: "r1" } });
  });

  it("doesn't sort the same text twice when Twilio retries", async () => {
    conflict = true;
    await call({ MessageSid: "SM9", From: "+15551234567", Body: "hi" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a text Twilio didn't sign, and stores nothing", async () => {
    const res = await call({ MessageSid: "SM9", From: "+15551234567", Body: "hi" }, false);
    expect(res.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it("acknowledges without storing when the client doesn't text through Twilio", async () => {
    tenant = { stack: { sms_platform: "ghl_sms" } };
    const res = await call({ MessageSid: "SM9", From: "+15551234567", Body: "hi" });
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(0);
  });
});
