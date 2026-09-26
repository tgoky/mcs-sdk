import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal Inngest: capture the handler, run steps inline.
let handler: (ctx: unknown) => Promise<unknown>;
const sent: unknown[] = [];
vi.mock("@/lib/inngest", () => ({
  inngest: {
    createFunction: (_cfg: unknown, fn: (ctx: unknown) => Promise<unknown>) => {
      handler = fn;
      return {};
    },
    send: async (e: unknown) => void sent.push(e),
  },
  smsReplyReceived: {},
  inboundReplyReceived: { create: (d: unknown) => ({ name: "win-back/inbound-reply-received", data: d }) },
  winBackSequenceStop: { create: (d: unknown) => ({ name: "win-back/sequence.stop", data: d }) },
}));

type Row = Record<string, unknown>;
let reply: Row | null;
let enrollment: Row | null;
let stack: Row;
const updates: { table: string; set: Row }[] = [];
vi.mock("@/models/schema", () => {
  const t = (name: string) => new Proxy({ __t: name }, { get: (o, k) => (k in o ? (o as Row)[k as string] : `${name}.${String(k)}`) });
  return { engagements: t("engagements"), smsReplies: t("smsReplies"), winBackEnrollments: t("winBackEnrollments") };
});
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (table: { __t: string }) => ({
        where: () => ({
          limit: async () => {
            if (table.__t === "smsReplies") return reply ? [reply] : [];
            if (table.__t === "winBackEnrollments") return enrollment ? [enrollment] : [];
            return [{ stack }];
          },
        }),
      }),
    }),
    update: (table: { __t: string }) => ({ set: (set: Row) => ({ where: async () => void updates.push({ table: table.__t, set }) }) }),
  },
}));

const lib = {
  matchProspect: vi.fn(),
  classifySmsReply: vi.fn(),
  isOptedOut: vi.fn(async () => false),
  recordOptOut: vi.fn(async () => undefined),
  recordOptIn: vi.fn(async () => undefined),
};
vi.mock("@/lib/sms-replies", async (orig) => ({ ...(await orig<typeof import("@/lib/sms-replies")>()), ...lib }));

await import("@/inngest/sms-reply");
const step = { run: async (_id: string, fn: () => unknown) => fn() };
const run = () => handler({ event: { data: { engagementId: "e1", replyId: "r1" } }, step });

describe("processing a text reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sent.length = 0;
    updates.length = 0;
    reply = { id: "r1", engagementId: "e1", fromPhone: "+15551234567", body: "can we do thursday", processedAt: null };
    enrollment = null;
    stack = {};
    lib.matchProspect.mockResolvedValue({ prospectEmail: "jo@x.com", prospectName: "Jo", bookingId: "b1", callTime: null });
  });

  it("routes a reschedule request to the Queue with who and which booking", async () => {
    lib.classifySmsReply.mockResolvedValue({ intent: "reschedule", confidence: 90, classifiedBy: "jev", ambiguousCancel: false });
    expect(await run()).toMatchObject({ handled: true, intent: "reschedule", routedToQueue: true, endedRecovery: false });
    expect(updates.at(-1)).toMatchObject({ table: "smsReplies", set: { intent: "reschedule", routedToQueue: true, prospectEmail: "jo@x.com", bookingId: "b1" } });
  });

  it("records STOP so every sequence stops texting them", async () => {
    lib.classifySmsReply.mockResolvedValue({ intent: "stop", confidence: 100, classifiedBy: "keyword", ambiguousCancel: false });
    await run();
    expect(lib.recordOptOut).toHaveBeenCalledWith("e1", "+15551234567");
    expect(updates.at(-1)?.set).toMatchObject({ routedToQueue: false });
  });

  it("ends an active recovery through the email tool when the client has one", async () => {
    enrollment = { id: "en1" };
    stack = { email_platform: "hubspot" };
    lib.classifySmsReply.mockResolvedValue({ intent: "question", confidence: 80, classifiedBy: "jev", ambiguousCancel: false });
    expect(await run()).toMatchObject({ endedRecovery: true });
    expect(sent).toEqual([{ name: "win-back/inbound-reply-received", data: { engagementId: "e1", fromEmail: "jo@x.com", subject: null, textBody: "can we do thursday", source: "sms" } }]);
  });

  it("ends it directly when recovery is texts only", async () => {
    enrollment = { id: "en1" };
    lib.classifySmsReply.mockResolvedValue({ intent: "confirm", confidence: 95, classifiedBy: "jev", ambiguousCancel: false });
    await run();
    expect(updates.find((u) => u.table === "winBackEnrollments")?.set).toMatchObject({ status: "reply_exited", exitReason: "sms_reply_detected" });
    expect(sent).toEqual([{ name: "win-back/sequence.stop", data: { enrollmentId: "en1" } }]);
  });

  it("does nothing the second time", async () => {
    reply = { ...reply!, processedAt: new Date() };
    expect(await run()).toMatchObject({ handled: false, reason: "already processed" });
    expect(lib.classifySmsReply).not.toHaveBeenCalled();
  });
});
