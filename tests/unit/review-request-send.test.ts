import { describe, it, expect, vi, beforeEach } from "vitest";
import { engagements, reviewRequests, sequenceMessageLog, bookingRoster } from "@/models/schema";

// A small stand-in for the query builder: rows per table, writes recorded.
const tables = new Map<unknown, Record<string, unknown>[]>();
const inserted: { table: unknown; values: Record<string, unknown> }[] = [];
const updated: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => {
  const read = (table: unknown) => {
    const rows = () => tables.get(table) ?? [];
    const chain = { where: () => chain, limit: async () => rows(), then: (r: (v: unknown) => unknown) => Promise.resolve(rows()).then(r) };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (t: unknown) => read(t) }),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown>) => {
          inserted.push({ table: t, values: v });
          return { returning: async () => [{ id: "log-1" }], onConflictDoNothing: () => ({ returning: async () => [{ id: "req-1" }] }) };
        },
      }),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => void updated.push(s) }) }),
    },
  };
});

const sendEmail = vi.fn();
vi.mock("@/lib/platforms/email", () => ({ createDirectSendClient: () => ({ sendEmail }), directSendProvider: () => "smtp" }));
const sendSms = vi.fn();
vi.mock("@/lib/platforms/sms", () => ({ sendSmsForTenant: (...a: unknown[]) => sendSms(...a) }));
const credential = vi.fn();
vi.mock("@/lib/credentials", () => ({ resolveCredential: (...a: unknown[]) => credential(...a) }));
const optedOut = vi.fn();
vi.mock("@/lib/sms-replies", () => ({ isOptedOut: (...a: unknown[]) => optedOut(...a) }));
const enabled = vi.fn();
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: (...a: unknown[]) => enabled(...a) }));
const send = vi.fn();
vi.mock("@/lib/inngest", () => ({ inngest: { send: (...a: unknown[]) => send(...a) }, reviewRequestScheduled: { create: (d: unknown) => d } }));

import { scheduleReviewRequest, sendReviewRequest } from "@/features/reputation-manager/server/review-requests";

const request = { id: "req-1", engagementId: "e1", trigger: "showed", refId: "b1", personName: "Sam Lee", email: "sam@acme.com", phone: "+15551234567", status: "scheduled", detail: null, channel: null, messageLogId: null, sendAt: new Date(), sentAt: null };
const tenant = (stack: Record<string, unknown>) => ({ engagementId: "e1", pausedAt: null, deletedAt: null, stack });

beforeEach(() => {
  tables.clear();
  inserted.length = 0;
  updated.length = 0;
  for (const f of [sendEmail, sendSms, credential, optedOut, enabled, send]) f.mockReset();
  enabled.mockResolvedValue(true);
  optedOut.mockResolvedValue(false);
  tables.set(reviewRequests, [{ ...request }]);
  tables.set(bookingRoster, []);
});

describe("sending a review request", () => {
  it("emails it with the client's link and logs it with the receipt", async () => {
    tables.set(engagements, [tenant({ rep_review_link: "https://g.page/r/abc/review", sms_platform: "twilio" })]);
    credential.mockResolvedValue("smtp-config");
    sendEmail.mockResolvedValue({ providerMessageId: "msg-9" });
    // No other request to this person yet: the recent-ask lookup finds none.
    tables.set(reviewRequests, [{ ...request }]);
    const origGet = tables.get.bind(tables);
    let reads = 0;
    tables.get = ((t: unknown) => (t === reviewRequests && ++reads > 1 ? [] : origGet(t))) as typeof tables.get;
    try {
      expect(await sendReviewRequest("e1", "req-1")).toMatchObject({ status: "sent" });
    } finally {
      tables.get = origGet;
    }
    expect(sendEmail).toHaveBeenCalledWith("sam@acme.com", "Quick favour, Sam?", expect.stringContaining("https://g.page/r/abc/review"));
    expect(sendSms).not.toHaveBeenCalled();
    const log = inserted.find((i) => i.table === sequenceMessageLog)!.values;
    expect(log).toMatchObject({ sequenceType: "review_request_email", channel: "email", status: "sent", provider: "smtp", providerMessageId: "msg-9", deliveryStatus: "accepted", bookingId: "b1" });
    expect(updated.at(-1)).toMatchObject({ status: "sent", channel: "email", messageLogId: "log-1" });
  });

  it("doesn't ask someone asked in the last 90 days", async () => {
    tables.set(engagements, [tenant({ rep_review_link: "https://x.test" })]);
    // Every read of review_requests returns a row, so the recent-ask lookup finds one.
    expect(await sendReviewRequest("e1", "req-1")).toMatchObject({ status: "skipped" });
    expect(updated.at(-1)?.detail).toContain("90 days");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("goes nowhere without a review link, or once turned off", async () => {
    tables.set(engagements, [tenant({})]);
    expect(await sendReviewRequest("e1", "req-1")).toMatchObject({ status: "skipped", detail: "No review link is set." });
    enabled.mockResolvedValue(false);
    tables.set(engagements, [tenant({ rep_review_link: "https://x.test" })]);
    expect(await sendReviewRequest("e1", "req-1")).toMatchObject({ status: "skipped" });
  });

  it("never sends a request that already went", async () => {
    tables.set(reviewRequests, [{ ...request, status: "sent" }]);
    expect(await sendReviewRequest("e1", "req-1")).toMatchObject({ status: "sent" });
    expect(updated).toEqual([]);
  });
});

describe("scheduling", () => {
  it("schedules after the client's wait, only with a link set and the skill on", async () => {
    tables.set(engagements, [{ stack: { rep_review_link: "https://x.test", rep_review_request_delay_hours: 3 } }]);
    const before = Date.now();
    expect(await scheduleReviewRequest("e1", { trigger: "paid", refId: "pay_1", name: "Sam", email: "Sam@Acme.com" })).toBe("req-1");
    const values = inserted[0].values;
    expect(values).toMatchObject({ trigger: "paid", refId: "pay_1", email: "sam@acme.com" });
    expect((values.sendAt as Date).getTime() - before).toBeGreaterThanOrEqual(3 * 3600_000 - 1000);
    expect(send).toHaveBeenCalledTimes(1);

    tables.set(engagements, [{ stack: {} }]);
    expect(await scheduleReviewRequest("e1", { trigger: "paid", refId: "pay_2", email: "a@b.co" })).toBeNull();
    expect(await scheduleReviewRequest("e1", { trigger: "paid", refId: "pay_3" })).toBeNull();
  });
});
