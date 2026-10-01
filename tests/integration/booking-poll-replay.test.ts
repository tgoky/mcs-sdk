// tests/integration/booking-poll-replay.test.ts
//
// Inngest re-runs a function from the top when a step fails or the request
// runs out of time. The booking poller claimed each booking outside any
// step and gave it a random run id, so on the re-run it found its own
// claim, counted the booking as a duplicate and dropped it halfway through.
import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const { handled, listCalls, failRun, behavior } = vi.hoisted(() => ({
  handled: [] as string[],
  listCalls: { n: 0 },
  failRun: vi.fn(async () => {}),
  behavior: { mode: "hang-then-finish" as "hang-then-finish" | "always-fail" },
}));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "key" }));
vi.mock("@/lib/platforms/booking", () => ({
  listBookingsSinceForTenant: async () => {
    listCalls.n++;
    return [{ id: "bk_1", email: "pat@example.com", name: "Pat", callTime: new Date(Date.now() + 86_400_000), eventKind: "created" }];
  },
  deriveWebhookIdempotencyKey: () => null,
}));
vi.mock("@/lib/booking-roster", () => ({ upsertBookingRoster: async () => ({ wrote: true }) }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
vi.mock("@/lib/run-log", async (orig) => ({ ...(await orig<typeof import("@/lib/run-log")>()), failRun }));
vi.mock("@/features/pile-on/server/enrollment-service", () => ({
  classifyBookingEvent: () => "created",
  handleInboundBookingEvent: (_p: unknown, _t: unknown, runId: string) => {
    handled.push(runId);
    if (behavior.mode === "always-fail") return Promise.reject(new Error("ESP down"));
    // First pass: the request is cut off mid-handling (Inngest abandons it
    // and invokes the function again). Second pass: it finishes.
    return handled.length === 1 ? new Promise(() => {}) : Promise.resolve();
  },
}));

// Remembers step results (and errors) by id across invocations, as Inngest does.
const memoStep = () => {
  const memo = new Map<string, { ok: boolean; value: unknown }>();
  return {
    run: async (id: string, fn: () => Promise<unknown>) => {
      const hit = memo.get(id);
      if (hit) {
        if (!hit.ok) throw hit.value;
        return hit.value;
      }
      try {
        const out = JSON.parse(JSON.stringify((await fn()) ?? null));
        memo.set(id, { ok: true, value: out });
        return out;
      } catch (e) {
        memo.set(id, { ok: false, value: e });
        throw e;
      }
    },
  };
};

d("booking poller across an Inngest re-run", () => {
  let engagementId = "";
  const workspaceId = `test-ws-poll-${crypto.randomUUID()}`;
  const whopUserId = `test-user-poll-${crypto.randomUUID()}`;

  const setup = async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    engagementId = `test-eng-poll-${crypto.randomUUID()}`;
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" }).onConflictDoNothing();
    await db.insert(engagements).values({
      engagementId, whopUserId, workspaceId, buyer: "Test Buyer",
      stack: { booking_platform: "calendly", webhook_receiver_mode: "polling" } as never,
    });
    handled.length = 0;
    listCalls.n = 0;
    failRun.mockClear();
  };

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns, webhookEvents } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(webhookEvents).where(eq(webhookEvents.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("finishes the booking on the re-run, under the same run, without fetching again", async () => {
    await setup();
    behavior.mode = "hang-then-finish";
    const { db } = await import("@/lib/db");
    const { skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { pollBookingsForEngagement } = await import("@/features/pin-down/server/booking-poller");
    const step = memoStep();

    void pollBookingsForEngagement(engagementId, step as never);
    await new Promise((r) => setTimeout(r, 300));
    const second = await pollBookingsForEngagement(engagementId, step as never);

    expect(second).toMatchObject({ newBookings: 1, duplicates: 0, errors: 0 });
    expect(handled).toHaveLength(2);
    expect(handled[1]).toBe(handled[0]);
    expect(listCalls.n).toBe(1);
    const runs = await db.select({ id: skillRuns.id }).from(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    expect(runs.map((r) => r.id)).toEqual([handled[0]]);
  });

  it("alerts about a failed booking once, however many re-runs follow", async () => {
    await setup();
    behavior.mode = "always-fail";
    const { pollBookingsForEngagement } = await import("@/features/pin-down/server/booking-poller");
    const step = memoStep();
    for (let i = 0; i < 3; i++) await pollBookingsForEngagement(engagementId, step as never);
    expect(failRun).toHaveBeenCalledTimes(1);
  });

  it("a database error while claiming fails the step, and its retry still claims the booking", async () => {
    await setup();
    behavior.mode = "always-fail";
    const { db } = await import("@/lib/db");
    const { webhookEvents } = await import("@/models/schema");
    const { pollBookingsForEngagement } = await import("@/features/pin-down/server/booking-poller");
    const realInsert = db.insert.bind(db);
    const spy = vi.spyOn(db, "insert").mockImplementationOnce(((table: unknown) => {
      if (table === webhookEvents) throw new Error("connection reset");
      return realInsert(table as never);
    }) as never);
    // Inngest retries a failed step on the next invocation; the stand-in
    // step here memoizes errors, so a fresh one plays the retry.
    await expect(pollBookingsForEngagement(engagementId, memoStep() as never)).rejects.toThrow("connection reset");
    spy.mockRestore();
    const retry = await pollBookingsForEngagement(engagementId, memoStep() as never);
    expect(retry).toMatchObject({ duplicates: 0 });
    expect(handled).toHaveLength(1);
  });
});
