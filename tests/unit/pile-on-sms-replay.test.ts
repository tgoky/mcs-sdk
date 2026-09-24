import { describe, it, expect, vi, beforeEach } from "vitest";

// Runs the real Pile-On SMS function the way Inngest does: a finished step
// returns its saved result, each new step or sleep ends the invocation,
// and the function is then run again from the top.
const sends: string[] = [];
type Handler = (ctx: { event: { data: Record<string, unknown> }; step: unknown }) => Promise<unknown>;
const holder: { handler?: Handler } = {};
vi.mock("@/lib/inngest", () => ({ inngest: { createFunction: (_c: unknown, fn: Handler) => ((holder.handler = fn), {}) }, pileOnSmsSequenceStart: {} }));
const tenant: Record<string, unknown> = {
  engagementId: "e1",
  pausedAt: null,
  deletedAt: null,
  stack: { sms_platform: "ghl_sms" },
  pileOnSmsAssetMap: {
    messages: [
      { id: "sms_1", offsetMinutes: 0, body: "Booked!" },
      { id: "sms_2", offsetMinutes: 1440, body: "Midway" },
      { id: "sms_3", offsetMinutes: 60, body: "An hour to go" },
    ],
  },
};
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [tenant] }) }) }), insert: () => ({ values: () => ({ returning: async () => [{ id: "l1" }] }) }) } }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "key" }));
const onSend = { after: (_n: number) => {} };
vi.mock("@/lib/platforms/sms", () => ({ sendSmsForTenant: async (_p: unknown, _k: unknown, _m: unknown, _to: unknown, body: string) => (sends.push(body), onSend.after(sends.length)) }));
vi.mock("@/lib/sequence-notify", () => ({ maybeNotifySequenceFailure: async () => {} }));

const HOUR = 3600_000;

async function replay(bookedAt: number, callAt: number, arrivesAt: number) {
  await import("@/inngest/pile-on-sms");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(arrivesAt);
  const done = new Map<string, unknown>();
  const slept = new Set<string>();
  // A new step or sleep ends the invocation the way Inngest does: the step's
  // promise never settles (so no try/catch sees it), and the next
  // invocation starts from the top.
  let endInvocation: () => void = () => {};
  const never = () => new Promise<never>(() => {});
  const step = {
    run: async (id: string, fn: () => Promise<unknown>) => {
      if (done.has(id)) return done.get(id);
      done.set(id, await fn());
      endInvocation();
      return never();
    },
    sleepUntil: async (id: string, until: string) => {
      if (slept.has(id)) return;
      slept.add(id);
      vi.setSystemTime(Math.max(Date.now(), new Date(until).getTime()) + 1000);
      endInvocation();
      return never();
    },
  };
  const data = { engagementId: "e1", runId: "r1", bookingId: "b1", prospectEmail: "p@x.com", prospectPhone: "+1", prospectName: "P", bookingCreatedAt: new Date(bookedAt).toISOString(), callTime: new Date(callAt).toISOString() };
  try {
    for (let i = 0; i < 100; i++) {
      const ended = new Promise<"ended">((resolve) => (endInvocation = () => resolve("ended")));
      const outcome = await Promise.race([holder.handler!({ event: { data }, step }), ended]);
      if (outcome !== "ended") return outcome;
    }
    throw new Error("never finished");
  } finally {
    vi.useRealTimers();
  }
}

describe("Pile-On SMS sequence", () => {
  beforeEach(() => {
    sends.length = 0;
    tenant.pausedAt = null;
    onSend.after = () => {};
  });

  it("sends every message once, in order, across Inngest's replays", async () => {
    const booked = Date.parse("2026-09-24T10:00:00Z");
    const result = await replay(booked, booked + 48 * HOUR, booked + 30_000);
    expect(sends).toEqual(["Booked!", "Midway", "An hour to go"]);
    expect(result).toMatchObject({ sent: 3 });
  });

  it("skips what was already overdue when a booking reaches us hours late", async () => {
    const booked = Date.parse("2026-09-24T10:00:00Z");
    await replay(booked, booked + 48 * HOUR, booked + 5 * HOUR);
    expect(sends).toEqual(["Midway", "An hour to go"]);
  });

  it("stops sending once the client is paused, even mid-sequence", async () => {
    const booked = Date.parse("2026-09-24T10:00:00Z");
    onSend.after = (n) => {
      if (n === 1) tenant.pausedAt = new Date().toISOString();
    };
    const result = await replay(booked, booked + 48 * HOUR, booked + 30_000);
    expect(sends).toEqual(["Booked!"]);
    expect(result).toMatchObject({ sent: 1 });
  });
});
