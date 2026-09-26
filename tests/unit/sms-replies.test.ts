import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const askJev = vi.fn();
vi.mock("@/lib/jev", () => ({ askJev: (...a: unknown[]) => askJev(...a) }));

import { phoneKey, classifyByKeyword, classifySmsReply, needsPerson, pickBooking, MIN_JEV_CONFIDENCE } from "@/lib/sms-replies";

describe("phone numbers", () => {
  it("treats the same number written different ways as one person", () => {
    expect(phoneKey("+1 (555) 123-4567")).toBe("5551234567");
    expect(phoneKey("5551234567")).toBe("5551234567");
    expect(phoneKey("+15551234567")).toBe("5551234567");
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("carrier keywords", () => {
  it("opts out on the exact words carriers honour, and only those", () => {
    expect(classifyByKeyword("STOP", false)).toEqual({ intent: "stop", ambiguousCancel: false });
    expect(classifyByKeyword(" unsubscribe. ", false)?.intent).toBe("stop");
    expect(classifyByKeyword("stop by at 3?", false)).toBeNull();
    expect(classifyByKeyword("Please stop texting me", false)).toBeNull();
  });

  it("flags a bare CANCEL: the carrier opts them out, but they may have meant the call", () => {
    expect(classifyByKeyword("Cancel", false)).toEqual({ intent: "stop", ambiguousCancel: true });
    expect(needsPerson({ intent: "stop", ambiguousCancel: true })).toBe(true);
    expect(needsPerson({ intent: "stop", ambiguousCancel: false })).toBe(false);
  });

  it("reads YES as a confirmation, unless they had opted out", () => {
    expect(classifyByKeyword("yes", false)).toEqual({ intent: "confirm", ambiguousCancel: false });
    expect(classifyByKeyword("YES", true)).toEqual({ intent: "start", ambiguousCancel: false });
    expect(classifyByKeyword("start", false)?.intent).toBe("start");
  });
});

describe("sorting other replies", () => {
  beforeEach(() => askJev.mockReset());
  const ctx = { engagementId: "e1", currentlyOptedOut: false };

  it("never asks Jev about a carrier keyword", async () => {
    expect(await classifySmsReply("STOP", ctx)).toMatchObject({ intent: "stop", classifiedBy: "keyword" });
    expect(askJev).not.toHaveBeenCalled();
  });

  it("uses Jev's pick when it's sure enough", async () => {
    askJev.mockResolvedValue({ answers: { intent: { type: "choice", choice: "reschedule", confidence: 0.91, probabilities: {} } } });
    expect(await classifySmsReply("can we do thursday instead", ctx)).toEqual({ intent: "reschedule", confidence: 91, classifiedBy: "jev", ambiguousCancel: false });
    expect(askJev.mock.calls[0][0]).toMatchObject({ reading: { engagementId: "e1", purpose: "sms-reply" } });
  });

  it("hands an unsure pick, an unknown option or a Jev failure to a person", async () => {
    askJev.mockResolvedValueOnce({ answers: { intent: { type: "choice", choice: "confirm", confidence: (MIN_JEV_CONFIDENCE - 5) / 100, probabilities: {} } } });
    expect((await classifySmsReply("hmm", ctx)).intent).toBe("other");
    askJev.mockResolvedValueOnce({ answers: { intent: { type: "choice", choice: "stop", confidence: 0.99, probabilities: {} } } });
    expect((await classifySmsReply("whatever", ctx)).intent).toBe("other");
    askJev.mockRejectedValueOnce(new Error("down"));
    expect(await classifySmsReply("whatever", ctx)).toMatchObject({ intent: "other", classifiedBy: "fallback" });
  });

  it("sends everything but confirmations and opt-ins to a person", () => {
    for (const intent of ["reschedule", "cancel", "question", "other"] as const) expect(needsPerson({ intent, ambiguousCancel: false })).toBe(true);
    expect(needsPerson({ intent: "confirm", ambiguousCancel: false })).toBe(false);
    expect(needsPerson({ intent: "start", ambiguousCancel: false })).toBe(false);
  });
});

describe("which booking a reply is about", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const b = (id: string, phone: string, days: number) => ({ id, phone, callTime: new Date(now.getTime() + days * 86_400_000) });

  it("prefers their next upcoming call, else their most recent one", () => {
    const rows = [b("past", "5551234567", -3), b("soon", "+1 555 123 4567", 1), b("later", "5551234567", 5), b("other", "5559999999", 1)];
    expect(pickBooking(rows, "5551234567", now)?.id).toBe("soon");
    expect(pickBooking([b("old", "5551234567", -10), b("recent", "5551234567", -1)], "5551234567", now)?.id).toBe("recent");
    expect(pickBooking(rows, "5550000000", now)).toBeNull();
  });
});
