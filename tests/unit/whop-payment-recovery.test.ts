import { describe, it, expect, vi, beforeEach } from "vitest";

// ── db stand-in: whop_payments rows keyed by payment id ──
const rows = new Map<string, Record<string, unknown>>();
const updates: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [...rows.values()].slice(0, 1),
        }),
      }),
    }),
    update: () => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          updates.push(s);
        },
      }),
    }),
  },
}));

const request = vi.fn();
vi.mock("@/lib/whop-agent/client", () => ({ WhopAgentClient: { forEngagement: async () => ({ request }) } }));
vi.mock("@/lib/approval-gate", () => ({ queuePendingAction: vi.fn() }));
vi.mock("@/lib/run-log", () => ({ startRun: vi.fn(), logStep: vi.fn(), finishRun: vi.fn(), failRun: vi.fn() }));
vi.mock("@/lib/platforms/conversation-intelligence", () => ({
  RECALL_NO_SHOW_SUB_CODES: new Set(["timeout_exceeded_noone_joined", "timeout_exceeded_waiting_room"]),
}));

import { DEFAULT_RECOVERY_MESSAGE, decideRecovery, recoveryRecipient, renderRecoveryMessage, summarizeRecovery, type RecoveryPaymentFields } from "@/features/whop-agent/server/recovery-message";
import { executePaymentRecoverySend } from "@/features/whop-agent/server/payment-recovery-service";
import { callEvidenceFrom } from "@/features/whop-agent/server/dispute-call-evidence";
import { paymentUpdateFromEvent } from "@/lib/whop-payments";
import { assembleTimeline, type TimelineSources, type TimelineProduct } from "@/lib/prospect-timeline";
import { eventsFor } from "@/lib/whop-setup/analyze";
import { parseWhopSetup } from "@/lib/whop-setup/save";

const failed: RecoveryPaymentFields & { paymentId: string } = {
  paymentId: "pay_1",
  outcome: "failed",
  email: "sam@acme.com",
  buyerUserId: "user_abc",
  buyerName: "Sam Lee",
  productTitle: "Scale Sprint",
  amount: 99,
  currency: "usd",
  recoveryStatus: null,
  recoverySentAt: null,
  recoveredAt: null,
  recoveredAmount: null,
};

describe("the recovery message", () => {
  it("fills in the buyer, product, amount and link", () => {
    expect(renderRecoveryMessage(DEFAULT_RECOVERY_MESSAGE, failed, "https://whop.com/manage/x")).toBe(
      "Hi Sam, your payment of $99.00 for Scale Sprint didn't go through, so your access may pause. You can update your card here: https://whop.com/manage/x. Reply here if anything's wrong."
    );
  });

  it("reads naturally when Whop left something out", () => {
    const msg = renderRecoveryMessage("Hi {name}, {amount} for {product}: {link}", { buyerName: null, productTitle: null, amount: null, currency: null }, null);
    expect(msg).toBe("Hi there, your latest payment for your membership: your Whop account, under Memberships");
    expect(msg).not.toMatch(/[{}]/);
  });

  it("messages the Whop user when known, else the email", () => {
    expect(recoveryRecipient(failed)).toBe("user_abc");
    expect(recoveryRecipient({ buyerUserId: null, email: "sam@acme.com" })).toBe("sam@acme.com");
    expect(recoveryRecipient({ buyerUserId: null, email: null })).toBeNull();
  });
});

describe("whether to send one", () => {
  it("sends for a fresh failed payment with someone to reach", () => {
    expect(decideRecovery(failed, 0)).toEqual({ go: true, recipient: "user_abc" });
  });

  it("never twice, never after they paid, never inside the cooldown, never without a recipient", () => {
    expect(decideRecovery({ ...failed, recoveryStatus: "queued" }, 0)).toMatchObject({ go: false });
    expect(decideRecovery({ ...failed, outcome: "paid" }, 0)).toMatchObject({ go: false });
    expect(decideRecovery(failed, 1)).toMatchObject({ go: false });
    const none = decideRecovery({ ...failed, buyerUserId: null, email: null }, 0);
    expect(none).toMatchObject({ go: false });
    expect(!none.go && none.reason).toContain("member:email:read");
  });
});

describe("recovered dollars", () => {
  it("counts only messaged payments that were paid afterwards, in Whop's amounts", () => {
    const t = summarizeRecovery([
      { ...failed, recoveryStatus: "sent", recoverySentAt: new Date(), recoveredAt: new Date(), recoveredAmount: 99, outcome: "paid" },
      { ...failed, recoveryStatus: "sent", recoverySentAt: new Date() },
      { ...failed, recoveryStatus: "queued" },
      { ...failed },
      { ...failed, outcome: "paid" },
    ]);
    expect(t).toEqual({ failed: 4, messaged: 2, recovered: 1, recoveredValue: 99, currency: "usd" });
  });
});

describe("sending, once approved", () => {
  beforeEach(() => {
    rows.clear();
    updates.length = 0;
    request.mockReset();
  });

  it("opens the DM and sends the message, keeping Whop's message id", async () => {
    rows.set("pay_1", { ...failed });
    request.mockImplementation(async (endpoint: string, path: string, opts: { body: Record<string, unknown> }) => {
      if (endpoint === "dm_channels.create") {
        expect(path).toBe("/v1/dm_channels");
        expect(opts.body).toEqual({ with_user_ids: ["user_abc"] });
        return { id: "feed_1" };
      }
      if (endpoint === "messages.create") {
        expect(opts.body).toEqual({ channel_id: "feed_1", content: "hello" });
        return { id: "msg_1" };
      }
      throw new Error(`unexpected ${endpoint}`);
    });
    expect(await executePaymentRecoverySend("e1", { paymentId: "pay_1", recipient: "user_abc", message: "hello" })).toEqual({ sent: true, messageId: "msg_1" });
    expect(updates.at(-1)).toMatchObject({ recoveryStatus: "sent", recoveryMessageId: "msg_1" });
  });

  it("sends nothing if they paid while it waited for approval", async () => {
    rows.set("pay_1", { ...failed, outcome: "paid" });
    expect(await executePaymentRecoverySend("e1", { paymentId: "pay_1", recipient: "user_abc", message: "hello" })).toEqual({ sent: false });
    expect(request).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ recoveryStatus: "skipped" });
  });

  it("records why a send failed", async () => {
    rows.set("pay_1", { ...failed });
    request.mockRejectedValue(new Error("Unauthorized: Actor is missing all required permissions: dms:channel:manage"));
    await expect(executePaymentRecoverySend("e1", { paymentId: "pay_1", recipient: "user_abc", message: "hello" })).rejects.toThrow("dms:channel:manage");
    expect(updates.at(-1)).toMatchObject({ recoveryStatus: "send_failed" });
  });
});

describe("the rest of the wiring", () => {
  it("keeps the buyer's Whop user id from the payment", () => {
    expect(paymentUpdateFromEvent("payment.failed", { id: "pay_1", user: { id: "user_abc", email: "Sam@Acme.com" } })?.fields).toMatchObject({ buyerUserId: "user_abc", email: "sam@acme.com" });
  });

  it("subscribes to failed and succeeded payments", () => {
    expect(eventsFor(["whop-payment-recovery"])).toEqual(expect.arrayContaining(["payment.failed", "payment.succeeded"]));
  });

  it("takes the client's message, or null to go back to the default", () => {
    const alerts = { refundRate: 0.06, disputeRate: 0.006, alertThreshold: 2, minSample: 10 };
    expect(parseWhopSetup({ skills: [], alerts, recoveryMessage: " Hi {name} " })).toMatchObject({ recoveryMessage: "Hi {name}" });
    expect(parseWhopSetup({ skills: [], alerts, recoveryMessage: "  " })).toMatchObject({ recoveryMessage: null });
    expect(parseWhopSetup({ skills: [], alerts })).not.toHaveProperty("recoveryMessage");
    expect(parseWhopSetup({ skills: [], alerts, recoveryMessage: "x".repeat(1001) })).toHaveProperty("error");
  });

  it("shows the message and the recovery on the buyer's journey", () => {
    const d = (s: string) => new Date(`2026-09-${s}Z`);
    const src: TimelineSources = {
      leads: [], replies: [], bookings: [], messages: [], textReplies: [], outcomes: [], recoveries: [],
      payments: [
        { paymentId: "pay_1", email: "sam@acme.com", outcome: "failed", amount: 99, currency: "usd", refundedAmount: null, productTitle: "Scale Sprint", paidAt: null, occurredAt: d("10T10:00:00"), failureMessage: "card_declined", recoveryStatus: "sent", recoverySentAt: d("10T12:00:00"), recoveredAt: d("11T09:00:00"), recoveredAmount: 99 },
      ],
    };
    const { events } = assembleTimeline(src, new Set<TimelineProduct>(["whop-agent"]));
    expect(events.map((e) => e.title)).toEqual(["Payment failed", "Sent a message to fix the payment", "Payment recovered"]);
    expect(events.at(-1)?.amount).toEqual({ value: 99, currency: "usd" });
  });
});

describe("dispute evidence from calls", () => {
  const at = (s: string) => new Date(`2026-09-${s}Z`);

  it("states what was booked, attended, recorded and delivered, with the first attended day", () => {
    const e = callEvidenceFrom({
      bookings: [
        { externalCallId: "b2", createdAt: at("04T09:00:00"), callTime: at("08T15:00:00"), status: "scheduled" },
        { externalCallId: "b1", createdAt: at("01T09:00:00"), callTime: at("03T15:00:00"), status: "scheduled" },
      ],
      outcomes: [
        { bookingId: "b1", outcome: "no_show", source: "dashboard", loggedAt: at("03T16:00:00") },
        { bookingId: "b1", outcome: "showed", source: "dashboard", loggedAt: at("03T17:00:00") },
      ],
      recordings: [{ bookingId: "b2", status: "done", subCode: "call_ended_by_host", completedAt: at("08T15:45:00"), extractionSummary: "Walked through the onboarding plan." }],
      deliveredReminders: 3,
    });
    expect(e.attended).toBe(2);
    expect(e.serviceDate).toBe("2026-09-03");
    expect(e.lines[0]).toBe("2026-09-01: booked a call for 2026-09-03 15:00 UTC.");
    expect(e.lines.some((l) => l.startsWith("2026-09-03: attended the call"))).toBe(true);
    expect(e.lines.some((l) => l.includes("recorded by a meeting bot") && l.includes("Walked through the onboarding plan."))).toBe(true);
    expect(e.lines.at(-1)).toBe("3 reminder messages were delivered to the buyer, confirmed by the carrier or email provider.");
  });

  it("never counts an empty meeting as attended", () => {
    const e = callEvidenceFrom({
      bookings: [{ externalCallId: "b1", createdAt: at("01T09:00:00"), callTime: at("03T15:00:00"), status: "scheduled" }],
      outcomes: [{ bookingId: "b1", outcome: "no_show", source: "recall_bot", loggedAt: at("03T16:00:00") }],
      recordings: [{ bookingId: "b1", status: "done", subCode: "timeout_exceeded_noone_joined", completedAt: at("03T15:20:00"), extractionSummary: null }],
      deliveredReminders: 0,
    });
    expect(e.attended).toBe(0);
    expect(e.serviceDate).toBeNull();
    expect(e.lines).toEqual(["2026-09-01: booked a call for 2026-09-03 15:00 UTC.", "2026-09-03: did not attend this call."]);
  });
});
