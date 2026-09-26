import { describe, it, expect, vi, beforeEach } from "vitest";
import { bookingRoster, briefOutcomeLog, engagements, reminderHoldouts, sequenceMessageLog } from "@/models/schema";

const tables = new Map<unknown, Record<string, unknown>[]>();
const inserted: { table: unknown; values: Record<string, unknown> }[] = [];
const updates: unknown[] = [];
vi.mock("@/lib/db", () => {
  const read = (t: unknown) => {
    const rows = () => tables.get(t) ?? [];
    const chain = { where: () => chain, limit: async () => rows() };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (t: unknown) => read(t) }),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown>) => {
          inserted.push({ table: t, values: v });
          const done = Promise.resolve();
          return Object.assign(done, { returning: async () => [{ id: "log-1" }], onConflictDoNothing: async () => undefined });
        },
      }),
      update: (t: unknown) => ({
        set: () => ({ where: () => ({ returning: async () => (updates.push(t), tables.get("share") ?? []) }) }),
      }),
    },
  };
});
const send = vi.fn();
vi.mock("@/lib/inngest", () => ({ inngest: { send: (...a: unknown[]) => send(...a) }, atRiskCheckInScheduled: { create: (d: unknown) => d } }));
const sms = vi.fn();
vi.mock("@/lib/platforms/sms", () => ({ sendSmsForTenant: (...a: unknown[]) => sms(...a) }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "test-credential" }));
const optedOut = vi.fn();
vi.mock("@/lib/sms-replies", () => ({ isOptedOut: (...a: unknown[]) => optedOut(...a) }));

import { checkInSendAt, isAtRisk, renderCheckIn, DEFAULT_CHECK_IN_MESSAGE } from "@/lib/at-risk";
import { maybeScheduleCheckIn, sendCheckIn } from "@/features/pile-on/server/at-risk-check-in";
import { compareHoldout, inHoldout, MIN_HOLDOUT_SAMPLE } from "@/lib/reminder-holdout";
import { hashShareToken, looksLikeShareToken, openShareLink } from "@/features/reports/server/share-links";

const now = new Date("2026-09-26T12:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);

describe("at-risk calls", () => {
  it("is at risk under the threshold, and never once an outcome is in", () => {
    expect(isAtRisk(35, undefined, null)).toBe(true);
    expect(isAtRisk(55, undefined, null)).toBe(false);
    expect(isAtRisk(55, 60, null)).toBe(true);
    expect(isAtRisk(35, undefined, "showed")).toBe(false);
    expect(isAtRisk(null, undefined, null)).toBe(false);
  });

  it("checks in three hours before, straight away when that's passed, never right before the call", () => {
    expect(checkInSendAt(inHours(24), now)).toEqual(inHours(21));
    expect(checkInSendAt(inHours(2), now)).toEqual(now);
    expect(checkInSendAt(inHours(0.2), now)).toBeNull();
  });

  it("says when the call is, in the client's time zone", () => {
    expect(renderCheckIn(DEFAULT_CHECK_IN_MESSAGE, "Sam Lee", new Date("2026-09-27T15:00:00Z"), "America/New_York")).toBe(
      "Hi Sam, just checking you're still good for our call on Sun, 11:00 AM EDT. Reply YES to confirm, or tell us a better time."
    );
  });

  beforeEach(() => {
    tables.clear();
    inserted.length = 0;
    send.mockReset();
    sms.mockReset();
    optedOut.mockReset().mockResolvedValue(false);
  });

  it("schedules only when the client turned check-ins on and the call is at risk", async () => {
    expect(await maybeScheduleCheckIn("e1", { at_risk_check_in: true }, { bookingId: "b1", callTime: inHours(24), probability: 30 }, now)).toBe(true);
    expect(send).toHaveBeenCalledWith({ engagementId: "e1", bookingId: "b1", sendAt: inHours(21).toISOString() });
    expect(await maybeScheduleCheckIn("e1", {}, { bookingId: "b1", callTime: inHours(24), probability: 30 }, now)).toBe(false);
    expect(await maybeScheduleCheckIn("e1", { at_risk_check_in: true }, { bookingId: "b1", callTime: inHours(24), probability: 80 }, now)).toBe(false);
  });

  const booking = { status: "scheduled", callTime: inHours(3), name: "Sam Lee", email: "sam@acme.com", phone: "+15551234567" };
  const withStack = (stack: Record<string, unknown>) => tables.set(engagements, [{ pausedAt: null, deletedAt: null, stack }]);

  it("sends one check-in through the client's texting tool and logs the receipt", async () => {
    withStack({ at_risk_check_in: true, sms_platform: "twilio", timezone: "UTC", sms_a2p_10dlc_status: "campaign_approved", sms_platform_meta: { twilio_account_sid: "AC-test" } });
    tables.set(bookingRoster, [booking]);
    sms.mockResolvedValue({ provider: "twilio", providerMessageId: "SM-1" });
    expect(await sendCheckIn("e1", "b1", now)).toEqual({ sent: true, messageLogId: "log-1" });
    expect(sms.mock.calls[0][4]).toContain("Hi Sam, just checking you're still good for our call");
    expect(inserted.find((i) => i.table === sequenceMessageLog)!.values).toMatchObject({ sequenceType: "at_risk_sms", bookingId: "b1", status: "sent", providerMessageId: "SM-1" });
  });

  it("doesn't send when an outcome is in, it already went, they opted out, or they're held out", async () => {
    withStack({ at_risk_check_in: true, sms_platform: "twilio" });
    tables.set(bookingRoster, [booking]);
    tables.set(briefOutcomeLog, [{ id: "o1" }]);
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false, reason: "An outcome is already in." });
    tables.delete(briefOutcomeLog);
    tables.set(sequenceMessageLog, [{ id: "x" }]);
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false, reason: "Already sent." });
    tables.delete(sequenceMessageLog);
    optedOut.mockResolvedValue(true);
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false, reason: "They texted STOP." });
    optedOut.mockResolvedValue(false);
    tables.set(reminderHoldouts, [{ heldOut: true }]);
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false });
    expect(sms).not.toHaveBeenCalled();
  });

  it("stops if turned off or the call was cancelled", async () => {
    withStack({ sms_platform: "twilio" });
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false, reason: "At-risk check-ins were turned off." });
    withStack({ at_risk_check_in: true, sms_platform: "twilio" });
    tables.set(bookingRoster, [{ ...booking, status: "cancelled" }]);
    expect(await sendCheckIn("e1", "b1", now)).toMatchObject({ sent: false, reason: "The booking was cancelled." });
  });
});

describe("holdout proof", () => {
  it("holds out about the chosen share, the same way every time", () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `booking-${i}`);
    const held = ids.filter((id) => inHoldout("e1", id, 10)).length;
    expect(held / ids.length).toBeGreaterThan(0.08);
    expect(held / ids.length).toBeLessThan(0.12);
    expect(ids.map((id) => inHoldout("e1", id, 10))).toEqual(ids.map((id) => inHoldout("e1", id, 10)));
    expect(ids.some((id) => inHoldout("e1", id, 0))).toBe(false);
    // Capped at 20% whatever is stored.
    expect(ids.filter((id) => inHoldout("e1", id, 90)).length / ids.length).toBeLessThan(0.23);
  });

  it("compares latest outcomes, and only calls it proof with enough on both sides", () => {
    const at = (m: number) => new Date(2026, 8, 1, 0, m);
    const decisions = [
      ...Array.from({ length: MIN_HOLDOUT_SAMPLE }, (_, i) => ({ bookingId: `r${i}`, heldOut: false })),
      ...Array.from({ length: MIN_HOLDOUT_SAMPLE }, (_, i) => ({ bookingId: `h${i}`, heldOut: true })),
    ];
    const outcomes = [
      ...decisions.filter((d) => !d.heldOut).map((d, i) => ({ bookingId: d.bookingId, outcome: i < 16 ? "showed" : "no_show", at: at(1) })),
      ...decisions.filter((d) => d.heldOut).map((d, i) => ({ bookingId: d.bookingId, outcome: i < 12 ? "showed" : "no_show", at: at(1) })),
      { bookingId: "r19", outcome: "showed", at: at(2) }, // corrected later
    ];
    expect(compareHoldout(decisions, outcomes)).toEqual({ reminded: { showed: 17, total: 20 }, heldOut: { showed: 12, total: 20 }, liftPoints: 25 });
    expect(compareHoldout(decisions.slice(0, 25), outcomes)?.liftPoints).toBeNull();
    expect(compareHoldout([], outcomes)).toBeNull();
  });
});

describe("share links", () => {
  it("only takes a token of the right shape, and stores its hash, never the token", async () => {
    expect(looksLikeShareToken("a".repeat(43))).toBe(true);
    expect(looksLikeShareToken("../etc")).toBe(false);
    expect(hashShareToken("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(await openShareLink("short")).toBeNull();
    expect(updates).toEqual([]); // never reached the database
    tables.set("share", [{ engagementId: "e1" }]);
    expect(await openShareLink("A".repeat(43))).toBe("e1");
  });
});
