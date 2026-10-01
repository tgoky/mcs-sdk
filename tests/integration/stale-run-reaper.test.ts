// tests/integration/stale-run-reaper.test.ts
//
// The reaper used to time every run from when it was created. A run sent
// through the dispatcher is created when it's queued, so under load runs
// still waiting in line were closed as "stuck" before they ever started.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("stale-run reaper rules", () => {
  const engagementId = `test-eng-reaper-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-reaper-${crypto.randomUUID()}`;
  const whopUserId = `test-user-reaper-${crypto.randomUUID()}`;
  const hours = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("times running work from its real start and lets queued work wait", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { findStaleRunIds, markRunExecuting, startRun, startRuns } = await import("@/lib/run-log");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const run = async (skillName: string, startedAt: Date, executionStartedAt: Date | null) => {
      const id = crypto.randomUUID();
      await db.insert(skillRuns).values({ id, engagementId, skillName, status: "running", startedAt, executionStartedAt });
      return id;
    };
    const queuedLong = await run("leak-map", hours(3), null);
    const executingLong = await run("leak-map", hours(3), hours(3));
    const queuedThenStarted = await run("leak-map", hours(3), hours(0.5));
    const queuedForever = await run("leak-map", hours(25), null);
    // Win-Back has a dispatcher too, but the booking webhook and the sweeps
    // run it inline; those runs start their clock at creation.
    const inlineWinBackLong = await run("win-back", hours(3), hours(3));

    const stale = new Set(await findStaleRunIds());
    expect(stale.has(queuedLong)).toBe(false);
    expect(stale.has(queuedThenStarted)).toBe(false);
    expect(stale.has(executingLong)).toBe(true);
    expect(stale.has(queuedForever)).toBe(true);
    expect(stale.has(inlineWinBackLong)).toBe(true);

    // The dispatcher's mark only records the first start.
    const fresh = await run("leak-map", hours(0), null);
    await markRunExecuting(fresh);
    const { eq } = await import("drizzle-orm");
    const [first] = await db.select({ at: skillRuns.executionStartedAt }).from(skillRuns).where(eq(skillRuns.id, fresh));
    await new Promise((r) => setTimeout(r, 20));
    await markRunExecuting(fresh);
    const [second] = await db.select({ at: skillRuns.executionStartedAt }).from(skillRuns).where(eq(skillRuns.id, fresh));
    expect(first.at).not.toBeNull();
    expect(second.at?.getTime()).toBe(first.at?.getTime());

    // Only a run handed to the queue waits for the dispatcher's mark.
    const [inline, queued, bulkQueued] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await startRun({ id: inline, engagementId, skillName: "win-back", phase: "p" });
    await startRun({ id: queued, engagementId, skillName: "leak-map", phase: "p", queued: true });
    await startRuns([{ id: bulkQueued, engagementId, skillName: "leak-map", phase: "p", queued: true }]);
    const { inArray } = await import("drizzle-orm");
    const rows = await db.select({ id: skillRuns.id, at: skillRuns.executionStartedAt }).from(skillRuns).where(inArray(skillRuns.id, [inline, queued, bulkQueued]));
    const started = Object.fromEntries(rows.map((r) => [r.id, r.at !== null]));
    expect(started).toEqual({ [inline]: true, [queued]: false, [bulkQueued]: false });

    // The dispatcher is told not to run a run that was closed before it
    // got to it (cancelled, reaped, or failed while being dispatched).
    await db.update(skillRuns).set({ status: "cancelled" }).where(eq(skillRuns.id, bulkQueued));
    expect(await markRunExecuting(bulkQueued)).toBe(false);
    expect(await markRunExecuting(queued)).toBe(true);
  });
});
