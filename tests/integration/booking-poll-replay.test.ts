// tests/integration/booking-poll-replay.test.ts
//
// Inngest re-runs a function from the top when a step fails or the request
// runs out of time. The booking poller claimed each booking outside any
// step and gave it a random run id, so on the re-run it found its own
// claim, counted the booking as a duplicate and dropped it halfway through.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const { handled } = vi.hoisted(() => ({ handled: [] as string[] }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "key" }));
vi.mock("@/lib/platforms/booking", () => ({
  listBookingsSinceForTenant: async () => [{ id: "bk_1", email: "pat@example.com", name: "Pat", callTime: new Date(Date.now() + 86_400_000), eventKind: "created" }],
  deriveWebhookIdempotencyKey: () => null,
}));
vi.mock("@/lib/booking-roster", () => ({ upsertBookingRoster: async () => ({ wrote: true }) }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
vi.mock("@/features/pile-on/server/enrollment-service", () => ({
  classifyBookingEvent: () => "created",
  handleInboundBookingEvent: (_p: unknown, _t: unknown, runId: string) => {
    handled.push(runId);
    // First pass: the request is cut off mid-handling (Inngest abandons it
    // and invokes the function again). Second pass: it finishes.
    return handled.length === 1 ? new Promise(() => {}) : Promise.resolve();
  },
}));

d("booking poller across an Inngest re-run", () => {
  const engagementId = `test-eng-poll-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-poll-${crypto.randomUUID()}`;
  const whopUserId = `test-user-poll-${crypto.randomUUID()}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns, webhookEvents } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(webhookEvents).where(eq(webhookEvents.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("finishes the booking on the re-run, under the same run", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { pollBookingsForEngagement } = await import("@/features/pin-down/server/booking-poller");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({
      engagementId, whopUserId, workspaceId, buyer: "Test Buyer",
      stack: { booking_platform: "calendly", webhook_receiver_mode: "polling" } as never,
    });

    // Remembers step results by id across invocations, as Inngest does.
    const memo = new Map<string, unknown>();
    const step = {
      run: async (id: string, fn: () => Promise<unknown>) => {
        if (memo.has(id)) return memo.get(id);
        const out = JSON.parse(JSON.stringify((await fn()) ?? null));
        memo.set(id, out);
        return out;
      },
    };

    void pollBookingsForEngagement(engagementId, step as never);
    await new Promise((r) => setTimeout(r, 300));
    const second = await pollBookingsForEngagement(engagementId, step as never);

    expect(second).toMatchObject({ newBookings: 1, duplicates: 0, errors: 0 });
    expect(handled).toHaveLength(2);
    expect(handled[1]).toBe(handled[0]);
    const runs = await db.select({ id: skillRuns.id }).from(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    expect(runs.map((r) => r.id)).toEqual([handled[0]]);
  });
});
