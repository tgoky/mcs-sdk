import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  nextDeliveryStatus,
  twilioDeliveryStatus,
  twilioSignature,
  isValidTwilioSignature,
  summarizeDeliveryProof,
  isProven,
  receiptColumns,
  twilioStatusCallbackUrl,
} from "@/lib/delivery-receipts";
import { deliveryLine } from "@/lib/delivery-receipts-shared";

describe("delivery status", () => {
  it("only moves forward, and never leaves a final state", () => {
    expect(nextDeliveryStatus(null, "sent")).toBe("sent");
    expect(nextDeliveryStatus("accepted", "sent")).toBe("sent");
    expect(nextDeliveryStatus("sent", "accepted")).toBe("sent");
    expect(nextDeliveryStatus("sent", "delivered")).toBe("delivered");
    // A late "sent" callback after delivery doesn't undo it.
    expect(nextDeliveryStatus("delivered", "sent")).toBe("delivered");
    expect(nextDeliveryStatus("undelivered", "delivered")).toBe("undelivered");
  });

  it("maps Twilio's statuses and ignores ones it doesn't know", () => {
    expect(twilioDeliveryStatus("queued")).toBe("accepted");
    expect(twilioDeliveryStatus("sent")).toBe("sent");
    expect(twilioDeliveryStatus("delivered")).toBe("delivered");
    expect(twilioDeliveryStatus("undelivered")).toBe("undelivered");
    expect(twilioDeliveryStatus("failed")).toBe("failed");
    expect(twilioDeliveryStatus("receiving")).toBeNull();
    expect(twilioDeliveryStatus(undefined)).toBeNull();
  });
});

describe("Twilio signatures", () => {
  const url = "https://app.example.com/api/webhooks/twilio-status/e1?token=t";
  const params = { MessageSid: "SM1", MessageStatus: "delivered", To: "+15550001111" };

  it("accepts Twilio's signature whatever order the fields arrive in", () => {
    const sig = twilioSignature("secret", url, params);
    expect(isValidTwilioSignature("secret", url, { To: "+15550001111", MessageStatus: "delivered", MessageSid: "SM1" }, sig)).toBe(true);
  });

  it("rejects a missing, tampered or wrongly keyed signature", () => {
    const sig = twilioSignature("secret", url, params);
    expect(isValidTwilioSignature("secret", url, params, null)).toBe(false);
    expect(isValidTwilioSignature("secret", url, { ...params, MessageStatus: "undelivered" }, sig)).toBe(false);
    expect(isValidTwilioSignature("other", url, params, sig)).toBe(false);
    expect(isValidTwilioSignature("secret", url.replace("e1", "e2"), params, sig)).toBe(false);
  });
});

describe("proof per skill", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const row = (o: Partial<Parameters<typeof summarizeDeliveryProof>[0][number]>) => ({
    sequenceType: "pile_on_sms",
    channel: "sms",
    status: "sent",
    provider: "twilio",
    providerMessageId: "SM1",
    deliveryStatus: "delivered",
    deliveryError: null,
    error: null,
    sentAt: hoursAgo(2),
    deliveredAt: hoursAgo(2),
    ...o,
  });
  const window = hoursAgo(24);

  it("a Twilio text counts only once delivered; an email counts once accepted", () => {
    expect(isProven({ provider: "twilio", providerMessageId: "SM1", deliveryStatus: "sent" })).toBe(false);
    expect(isProven({ provider: "twilio", providerMessageId: "SM1", deliveryStatus: "delivered" })).toBe(true);
    expect(isProven({ provider: "smtp", providerMessageId: "<a@b>", deliveryStatus: "accepted" })).toBe(true);
    expect(isProven({ provider: "smtp", providerMessageId: null, deliveryStatus: null })).toBe(false);
  });

  it("finds the latest proven delivery and counts recent failures, per skill", () => {
    const proof = summarizeDeliveryProof(
      [
        row({ sentAt: hoursAgo(1), deliveryStatus: "undelivered", deliveredAt: null, deliveryError: "Twilio error 30006: Landline" }),
        row({ sentAt: hoursAgo(3), deliveredAt: hoursAgo(3) }),
        row({ sequenceType: "win_back_email_smtp", channel: "email", provider: "smtp", deliveryStatus: "accepted", deliveredAt: null, sentAt: hoursAgo(30) }),
        row({ sequenceType: "win_back_sms", status: "failed", provider: null, providerMessageId: null, deliveryStatus: null, error: "A2P not approved", sentAt: hoursAgo(5) }),
      ],
      window
    );
    expect(proof["pile-on"]).toEqual({ lastProvenAt: hoursAgo(3).toISOString(), lastProvenChannel: "sms", failedRecently: 1, sentRecently: 2, lastFailureReason: "Twilio error 30006: Landline" });
    expect(proof["win-back"]).toMatchObject({ lastProvenAt: hoursAgo(30).toISOString(), lastProvenChannel: "email", failedRecently: 1, sentRecently: 1, lastFailureReason: "A2P not approved" });
  });
});

describe("what the skills list says", () => {
  const since = () => "2 hours ago";
  const base = { lastProvenAt: null, lastProvenChannel: null, failedRecently: 0, sentRecently: 0, lastFailureReason: null } as const;

  it("marks a skill whose recent messages all failed as not delivering", () => {
    expect(deliveryLine({ ...base, sentRecently: 3, failedRecently: 3, lastFailureReason: "Twilio error 21610: opted out" }, since)).toEqual({
      text: "None of the last 3 messages got through: Twilio error 21610: opted out",
      tone: "error",
      notDelivering: true,
    });
  });

  it("warns on some failures, shows proof otherwise, and says nothing without sends", () => {
    expect(deliveryLine({ ...base, sentRecently: 4, failedRecently: 1, lastProvenAt: "x", lastProvenChannel: "sms", lastFailureReason: "Landline" }, since)?.tone).toBe("error");
    expect(deliveryLine({ ...base, lastProvenAt: "x", lastProvenChannel: "email" }, since)).toEqual({ text: "Last proven delivery: 2 hours ago (email)", tone: "neutral", notDelivering: false });
    expect(deliveryLine({ ...base, sentRecently: 1 }, since)?.text).toBe("Sent, waiting for the provider to confirm delivery");
    expect(deliveryLine(base, since)).toBeNull();
    expect(deliveryLine(undefined, since)).toBeNull();
  });
});

describe("sending side", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("records the receipt a provider gave back", () => {
    expect(receiptColumns({ provider: "twilio", providerMessageId: "SM1" })).toMatchObject({ provider: "twilio", providerMessageId: "SM1", deliveryStatus: "accepted" });
    expect(receiptColumns({ provider: "ghl_sms", providerMessageId: null })).toMatchObject({ provider: "ghl_sms", providerMessageId: null, deliveryStatus: null });
    expect(receiptColumns(null)).toEqual({});
  });

  it("gives Twilio a tokened callback address only when the app has a public URL", () => {
    vi.stubEnv("WEBHOOK_URL_SECRET", "s");
    expect(twilioStatusCallbackUrl("e1", "https://app.example.com")).toMatch(/^https:\/\/app\.example\.com\/api\/webhooks\/twilio-status\/e1\?token=/);
    expect(twilioStatusCallbackUrl("e1", "http://localhost:3000")).toBeNull();
    expect(twilioStatusCallbackUrl("e1", "")).toBeNull();
  });
});
