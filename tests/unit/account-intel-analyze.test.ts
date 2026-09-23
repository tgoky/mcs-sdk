import { describe, it, expect } from "vitest";
import {
  collectAnswers,
  matchEventTypeToLink,
  scrubContact,
  summarizeBookings,
  summarizeCampaigns,
  summarizeDeals,
  type BookingRecord,
  type EventTypeInfo,
} from "@/lib/account-intel/analyze";

const now = new Date("2026-09-01T12:00:00Z");
const daysAgo = (d: number, hourUtc = 15) => {
  const t = new Date(now.getTime() - d * 86_400_000);
  t.setUTCHours(hourUtc, 0, 0, 0);
  return t.toISOString();
};

describe("summarizeBookings", () => {
  it("counts bookings, cancels and no-shows only among calls whose attendance was read", () => {
    const records: BookingRecord[] = [];
    // 10 past held calls with attendance read, 2 marked no-show
    for (let i = 0; i < 10; i++) records.push({ startAt: daysAgo(i + 1), createdAt: daysAgo(i + 3), status: "active", noShow: i < 2, eventTypeId: "t1", eventName: "Strategy Call", hostName: "Ana" });
    // 3 past calls nobody opened: not in the no-show sample
    for (let i = 0; i < 3; i++) records.push({ startAt: daysAgo(20 + i), status: "active", noShow: null, eventTypeId: "t1", eventName: "Strategy Call" });
    // 2 canceled, 1 upcoming
    records.push({ startAt: daysAgo(5), status: "canceled", cancelReason: "Found another option, email me at a@b.com", eventTypeId: "t2", eventName: "Onboarding" });
    records.push({ startAt: daysAgo(6), status: "canceled", eventTypeId: "t1", eventName: "Strategy Call" });
    records.push({ startAt: new Date(now.getTime() + 2 * 86_400_000).toISOString(), status: "active", eventTypeId: "t1", eventName: "Strategy Call" });

    const h = summarizeBookings(records, { now, windowDays: 90 });
    expect(h.total).toBe(16);
    expect(h.upcoming).toBe(1);
    expect(h.canceled).toBe(2);
    expect(h.cancelRate).toBe(12.5);
    expect(h.attendanceKnown).toBe(10);
    expect(h.noShows).toBe(2);
    expect(h.noShowRate).toBe(20);
    expect(h.medianLeadTimeDays).toBe(2);
    expect(h.byEventType[0]).toMatchObject({ id: "t1", name: "Strategy Call", count: 15, canceled: 1 });
    expect(h.hosts[0]).toEqual({ name: "Ana", count: 10 });
    // Contact details a prospect typed never leave the account read.
    expect(h.cancelReasons[0]).toBe("Found another option, email me at [email]");
  });

  it("gives no no-show rate from too few calls", () => {
    const records: BookingRecord[] = [{ startAt: daysAgo(1), status: "no_show" }, { startAt: daysAgo(2), status: "showed" }];
    expect(summarizeBookings(records, { now, windowDays: 90 }).noShowRate).toBeNull();
  });

  it("names the busiest day in the account's own timezone", () => {
    // 12 calls at 03:00 UTC on a Tuesday are Monday evening in New York.
    const tuesday = "2026-08-25T03:00:00Z";
    const records: BookingRecord[] = Array.from({ length: 12 }, () => ({ startAt: tuesday, status: "active" as const }));
    const h = summarizeBookings(records, { now, windowDays: 90, timeZone: "America/New_York" });
    expect(h.busiestDays).toEqual(["Monday"]);
    expect(h.busiestHours).toEqual(["11pm"]);
  });
});

describe("collectAnswers", () => {
  it("groups real answers by question and skips contact-detail questions", () => {
    const records: BookingRecord[] = [
      { startAt: daysAgo(1), status: "active", answers: [{ question: "What's your biggest challenge?", answer: "Leads ghost after booking" }, { question: "Phone number", answer: "+1 555 123 4567" }] },
      { startAt: daysAgo(2), status: "active", answers: [{ question: "What's your biggest challenge?", answer: "Call me at 555-123-4567 about churn" }] },
    ];
    const out = collectAnswers(records);
    expect(out).toHaveLength(1);
    expect(out[0].responses).toBe(2);
    expect(out[0].answers).toEqual(["Leads ghost after booking", "Call me at [phone] about churn"]);
  });
});

describe("summarizeDeals", () => {
  it("works out win rate, deal size, cycle length and open pipeline", () => {
    const deals = [
      ...Array.from({ length: 4 }, (_, i) => ({ status: "won" as const, amount: 4000 + i * 1000, createdAt: daysAgo(40), closedAt: daysAgo(10) })),
      { status: "lost" as const, lostReason: "Too expensive" },
      { status: "open" as const, amount: 3000, stage: "Proposal" },
      { status: "open" as const, amount: 2000, stage: "Proposal" },
    ];
    const d = summarizeDeals(deals, "USD");
    expect(d.winRate).toBe(80);
    expect(d.averageWon).toBe(5500);
    expect(d.medianWon).toBe(5500);
    expect(d.medianCycleDays).toBe(30);
    expect(d.openValue).toBe(5000);
    expect(d.stages).toEqual([{ stage: "Proposal", count: 2 }]);
    expect(d.lostReasons).toEqual(["Too expensive"]);
  });
});

describe("summarizeCampaigns", () => {
  it("weights open rates by audience and ignores tiny sends", () => {
    const e = summarizeCampaigns([
      { subject: "Big send", sentAt: "2026-08-01", recipients: 1000, openRate: 0.4, clickRate: 0.05 },
      { subject: "Small send", sentAt: "2026-07-01", recipients: 3000, openRate: 0.2, clickRate: 0.01 },
      { subject: "Test to self", sentAt: "2026-06-01", recipients: 2, openRate: 1 },
    ]);
    expect(e.campaigns).toBe(3);
    expect(e.averageOpenRate).toBe(25);
    expect(e.bestSubjects[0]).toEqual({ subject: "Big send", openRate: 40 });
    expect(e.lastSentAt).toBe("2026-08-01");
  });
});

describe("matchEventTypeToLink", () => {
  const types: EventTypeInfo[] = [
    { id: "u1", name: "Discovery", slug: "discovery", url: "https://calendly.com/acme/discovery", active: true, questions: [] },
    { id: "u2", name: "Onboarding", slug: "onboarding", url: "https://calendly.com/acme/onboarding", active: true, questions: [] },
  ];
  it("matches by URL, ignoring protocol, www, query and trailing slash", () => {
    expect(matchEventTypeToLink(types, "http://www.calendly.com/acme/discovery/?utm_source=site")?.id).toBe("u1");
  });
  it("falls back to a unique slug", () => {
    expect(matchEventTypeToLink(types, "https://acme.com/book/onboarding")?.id).toBe("u2");
  });
  it("returns nothing without a link", () => {
    expect(matchEventTypeToLink(types, null)).toBeNull();
  });
});

describe("scrubContact", () => {
  it("masks emails and phone numbers", () => {
    expect(scrubContact("reach me: jo@x.io or (415) 555-0199")).toBe("reach me: [email] or [phone]");
  });
});
