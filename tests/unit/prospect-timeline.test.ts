import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/engagement-skills", () => ({ getEnabledWorkerIdsForEngagement: vi.fn() }));
vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));

import { laterOutcome, paymentUpdateFromEvent } from "@/lib/whop-payments";
import { assembleTimeline, type TimelineSources, type TimelineProduct } from "@/lib/prospect-timeline";
import { journeyLine, money } from "@/app/dashboard/engagements/[id]/prospect-journey";
import { eventsFor } from "@/lib/whop-setup/analyze";

describe("Whop payments", () => {
  it("reads a succeeded payment in Whop's own field names", () => {
    const u = paymentUpdateFromEvent("payment.succeeded", {
      id: "pay_1",
      status: "paid",
      total: 3000,
      usd_total: 3000,
      currency: "usd",
      paid_at: "2026-09-20T10:00:00Z",
      user: { id: "u1", email: "Jo@Acme.com", name: "Jo" },
      member: { id: "m1", phone: "+15551234567" },
      membership: { id: "mem_1", status: "active" },
      product: { id: "prod_1", title: "Scale Sprint" },
    });
    expect(u).toMatchObject({ paymentId: "pay_1", outcome: "paid", fields: { email: "jo@acme.com", phone: "+15551234567", amount: 3000, currency: "usd", productTitle: "Scale Sprint", membershipId: "mem_1" } });
  });

  it("reads failed payments, refunds and disputes against their payment", () => {
    expect(paymentUpdateFromEvent("payment.failed", { id: "pay_2", failure_message: "card_declined", next_payment_attempt: "2026-09-22T00:00:00Z" })).toMatchObject({ outcome: "failed", fields: { failureMessage: "card_declined" } });
    expect(paymentUpdateFromEvent("refund.created", { id: "re_1", amount: 1000, currency: "usd", payment: { id: "pay_1" } })).toEqual({ paymentId: "pay_1", outcome: "refunded", fields: { refundedAmount: 1000, currency: "usd" } });
    expect(paymentUpdateFromEvent("dispute.created", { id: "dp_1", customer_email_address: "JO@acme.com", payment: { id: "pay_1" } })).toMatchObject({ paymentId: "pay_1", outcome: "disputed", fields: { email: "jo@acme.com" } });
    expect(paymentUpdateFromEvent("refund.created", { id: "re_2" })).toBeNull();
    expect(paymentUpdateFromEvent("membership.activated", { id: "x" })).toBeNull();
  });

  it("never lets a late 'paid' undo a refund or a dispute", () => {
    expect(laterOutcome(null, "failed")).toBe("failed");
    expect(laterOutcome("failed", "paid")).toBe("paid");
    expect(laterOutcome("refunded", "paid")).toBe("refunded");
    expect(laterOutcome("paid", "disputed")).toBe("disputed");
  });

  it("subscribes to payments whichever workers are on", () => {
    expect(eventsFor([])).toEqual(expect.arrayContaining(["payment.succeeded", "payment.failed", "refund.created", "dispute.created", "invoice.past_due"]));
  });
});

describe("one person's journey", () => {
  const d = (s: string) => new Date(`2026-09-${s}Z`);
  const src: TimelineSources = {
    leads: [{ pushedAt: d("01T09:00:00"), createdAt: d("01T09:00:00"), campaignId: "camp-B", status: "pushed" }],
    replies: [{ classifiedAt: d("03T12:00:00"), disposition: "interested", rawBody: "Yes, let's talk", campaignId: "camp-B" }],
    bookings: [{ externalCallId: "b1", createdAt: d("03T13:00:00"), callTime: d("05T15:00:00"), status: "scheduled", updatedAt: d("03T13:00:00") }],
    messages: [
      { sentAt: d("04T15:00:00"), channel: "sms", sequenceType: "pile_on_sms", status: "sent", provider: "twilio", providerMessageId: "SM1", deliveryStatus: "delivered", deliveryError: null, error: null },
      { sentAt: d("05T13:00:00"), channel: "sms", sequenceType: "pile_on_sms", status: "sent", provider: "twilio", providerMessageId: "SM2", deliveryStatus: "undelivered", deliveryError: "Twilio error 30006", error: null },
    ],
    textReplies: [{ receivedAt: d("05T14:00:00"), intent: "confirm", body: "see you then" }],
    outcomes: [{ loggedAt: d("05T16:00:00"), outcome: "showed", source: "slack" }],
    recoveries: [],
    payments: [{ paymentId: "pay_1", email: "jo@acme.com", outcome: "paid", amount: 3000, currency: "usd", refundedAmount: null, productTitle: "Scale Sprint", paidAt: d("06T10:00:00"), occurredAt: d("06T10:00:00"), failureMessage: null }],
  };
  const all = new Set<TimelineProduct>(["cold-open", "showtime", "whop-agent"]);

  it("puts every product's steps in order, each saying how it's known", () => {
    const { events, summary } = assembleTimeline(src, all);
    expect(events.map((e) => e.kind)).toEqual(["emailed", "replied", "booked", "message", "message", "text_reply", "showed", "paid"]);
    expect(events.find((e) => e.kind === "message" && !e.warn)?.proof).toBe("Delivered (provider receipt)");
    expect(events.find((e) => e.kind === "message" && e.warn)?.proof).toBe("Not delivered: Twilio error 30006");
    expect(events.find((e) => e.kind === "showed")?.proof).toBe("Confirmed via Slack");
    expect(summary).toEqual({ emailed: true, replied: true, booked: true, showed: true, paid: { value: 3000, currency: "usd" }, refunded: null, disputed: false, campaignId: "camp-B" });
    expect(journeyLine({ summary })).toEqual(["Emailed", "Replied", "Booked", "Showed", `Paid ${money({ value: 3000, currency: "usd" })}`]);
  });

  it("shows only what the client's products cover, and works with any subset", () => {
    const showtimeOnly = assembleTimeline(src, new Set<TimelineProduct>(["showtime"]));
    expect(showtimeOnly.events.every((e) => e.product === "showtime")).toBe(true);
    expect(showtimeOnly.summary).toMatchObject({ emailed: false, booked: true, showed: true, paid: null, campaignId: null });

    const whopOnly = assembleTimeline(src, new Set<TimelineProduct>(["whop-agent"]));
    expect(whopOnly.events.map((e) => e.kind)).toEqual(["paid"]);
  });

  it("records a refund and a dispute against the payment", () => {
    const refunded = assembleTimeline({ ...src, payments: [{ ...src.payments[0], outcome: "refunded", refundedAmount: 3000, occurredAt: d("10T10:00:00") }] }, all);
    expect(refunded.events.slice(-2).map((e) => e.kind)).toEqual(["paid", "refunded"]);
    expect(refunded.summary.refunded).toEqual({ value: 3000, currency: "usd" });
    const failed = assembleTimeline({ ...src, payments: [{ ...src.payments[0], outcome: "failed", failureMessage: "card_declined" }] }, all);
    expect(failed.events.at(-1)).toMatchObject({ kind: "payment_failed", warn: true, detail: "card_declined" });
    expect(failed.summary.paid).toBeNull();
  });
});
