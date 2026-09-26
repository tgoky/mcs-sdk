import { describe, it, expect, vi, beforeEach } from "vitest";

let tenant: { stack: Record<string, unknown> } | undefined;
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (tenant ? [tenant] : []) }) }) }) },
}));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => ({ allowed: true, count: 1, retryAfterSeconds: 0 }), RATE_LIMITS: { twilioWebhook: { name: "t", limit: 1, windowSeconds: 1 } } }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn(async () => "auth-token") }));
const recordDeliveryStatus = vi.fn(async () => true);
vi.mock("@/lib/delivery-receipts", async (orig) => ({ ...(await orig<typeof import("@/lib/delivery-receipts")>()), recordDeliveryStatus: (...a: unknown[]) => (recordDeliveryStatus as (...x: unknown[]) => Promise<boolean>)(...a) }));

import { POST } from "@/app/api/webhooks/twilio-status/[engagementId]/route";
import { twilioSignature, twilioStatusCallbackUrl } from "@/lib/delivery-receipts";

const APP = "https://app.example.com";

function call(fields: Record<string, string>, opts: { url?: string; signature?: string | null } = {}) {
  const url = opts.url ?? twilioStatusCallbackUrl("e1", APP)!;
  const sig = opts.signature === undefined ? twilioSignature("auth-token", url, fields) : opts.signature;
  const req = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(sig ? { "x-twilio-signature": sig } : {}) },
    body: new URLSearchParams(fields).toString(),
  });
  return POST(req, { params: Promise.resolve({ engagementId: "e1" }) });
}

describe("Twilio status callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WEBHOOK_URL_SECRET", "s");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
    tenant = { stack: { sms_platform: "twilio" } };
  });

  it("records a signed delivery report", async () => {
    const res = await call({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(res.status).toBe(204);
    expect(recordDeliveryStatus).toHaveBeenCalledWith("e1", "SM1", "delivered", null);
  });

  it("keeps Twilio's error code on a failed delivery", async () => {
    await call({ MessageSid: "SM1", MessageStatus: "undelivered", ErrorCode: "30006", ErrorMessage: "Landline or unreachable carrier" });
    expect(recordDeliveryStatus).toHaveBeenCalledWith("e1", "SM1", "undelivered", "Twilio error 30006: Landline or unreachable carrier");
  });

  it("rejects an address without the client's token", async () => {
    const res = await call({ MessageSid: "SM1", MessageStatus: "delivered" }, { url: `${APP}/api/webhooks/twilio-status/e1` });
    expect(res.status).toBe(401);
    expect(recordDeliveryStatus).not.toHaveBeenCalled();
  });

  it("rejects a report Twilio didn't sign", async () => {
    expect((await call({ MessageSid: "SM1", MessageStatus: "delivered" }, { signature: null })).status).toBe(403);
    expect((await call({ MessageSid: "SM1", MessageStatus: "delivered" }, { signature: "forged" })).status).toBe(403);
    expect(recordDeliveryStatus).not.toHaveBeenCalled();
  });

  it("ignores clients that don't text through Twilio, and statuses it doesn't know", async () => {
    tenant = { stack: { sms_platform: "ghl_sms" } };
    expect((await call({ MessageSid: "SM1", MessageStatus: "delivered" })).status).toBe(204);
    tenant = { stack: { sms_platform: "twilio" } };
    await call({ MessageSid: "SM1", MessageStatus: "receiving" });
    expect(recordDeliveryStatus).not.toHaveBeenCalled();
  });
});
