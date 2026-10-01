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
    const { findStaleRunIds, markRunExecuting } = await import("@/lib/run-log");
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
    const immediateLong = await run("pile-on", hours(3), null);

    const dispatched = (name: string) => name === "leak-map";
    const stale = new Set(await findStaleRunIds(dispatched));
    expect(stale.has(queuedLong)).toBe(false);
    expect(stale.has(queuedThenStarted)).toBe(false);
    expect(stale.has(executingLong)).toBe(true);
    expect(stale.has(queuedForever)).toBe(true);
    expect(stale.has(immediateLong)).toBe(true);

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
  });
});
