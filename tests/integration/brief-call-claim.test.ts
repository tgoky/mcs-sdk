// tests/integration/brief-call-claim.test.ts
//
// Each call's brief runs as its own parallel invocation. The old guard
// ("delivered in the last 24h?") and the final write were separate, so two
// overlapping runs both passed it: two briefs to the rep, and two
// notetaker bots sent into the prospect's meeting.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("pre-call brief claim", () => {
  const engagementId = `test-eng-brief-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-brief-${crypto.randomUUID()}`;
  const whopUserId = `test-user-brief-${crypto.randomUUID()}`;
  const call = () => ({ id: `call_${crypto.randomUUID()}`, callTime: new Date(Date.now() + 3600_000), name: "Pat", email: "pat@example.com" });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, briefedCallsLog } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(briefedCallsLog).where(eq(briefedCallsLog.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("lets exactly one run brief a call, and still allows retries", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, briefedCallsLog } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { claimCallForBrief } = await import("@/features/pre-call-read/server/brief-service");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    const runA = crypto.randomUUID();
    const runB = crypto.randomUUID();

    // Two runs reach the same call at once: one wins.
    const c1 = call();
    const results = await Promise.all([claimCallForBrief(engagementId, runA, c1), claimCallForBrief(engagementId, runB, c1)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? runA : runB;
    // The winner's own retry may re-claim; the other run still can't.
    expect(await claimCallForBrief(engagementId, winner, c1)).toBe(true);
    expect(await claimCallForBrief(engagementId, winner === runA ? runB : runA, c1)).toBe(false);

    // Delivered: nobody re-briefs it within 24 hours.
    await db.update(briefedCallsLog).set({ briefDeliveredAt: new Date(), claimRunId: null, claimedAt: null }).where(eq(briefedCallsLog.callId, c1.id));
    expect(await claimCallForBrief(engagementId, crypto.randomUUID(), c1)).toBe(false);

    // A failed attempt releases its claim, so the next run retries at once.
    const c2 = call();
    expect(await claimCallForBrief(engagementId, runA, c2)).toBe(true);
    await db.update(briefedCallsLog).set({ aiSynthesisStatus: "failed", claimRunId: null, claimedAt: null }).where(eq(briefedCallsLog.callId, c2.id));
    expect(await claimCallForBrief(engagementId, runB, c2)).toBe(true);

    // A claim left by a run that died is taken over after 30 minutes.
    const c3 = call();
    expect(await claimCallForBrief(engagementId, runA, c3)).toBe(true);
    expect(await claimCallForBrief(engagementId, runB, c3)).toBe(false);
    await db.update(briefedCallsLog).set({ claimedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(briefedCallsLog.callId, c3.id));
    expect(await claimCallForBrief(engagementId, runB, c3)).toBe(true);
  });
});
