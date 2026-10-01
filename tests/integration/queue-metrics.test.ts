// tests/integration/queue-metrics.test.ts
//
// Queue wait is recorded when the dispatcher starts a run, measured from
// when the run was ready: its creation, or its scheduled start offset when
// that's later (the offset is deliberate, not queueing).
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("queue wait and metrics", () => {
  const engagementId = `test-eng-queue-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-queue-${crypto.randomUUID()}`;
  const whopUserId = `test-user-queue-${crypto.randomUUID()}`;
  const skillName = `test-skill-${crypto.randomUUID().slice(0, 8)}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(skillRuns).where(eq(skillRuns.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("measures wait from when a run was ready and reports it per skill", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, skillRuns } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { markRunExecuting } = await import("@/lib/run-log");
    const { getQueueMetrics } = await import("@/lib/queue-metrics");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const ago = (s: number) => new Date(Date.now() - s * 1000);
    const created = async (startedAt: Date) => {
      const id = crypto.randomUUID();
      await db.insert(skillRuns).values({ id, engagementId, skillName, status: "running", startedAt });
      return id;
    };
    // Created 100s ago, nothing scheduled: waited ~100s.
    const plain = await created(ago(100));
    await markRunExecuting(plain);
    // Created 100s ago but scheduled to start 40s ago: waited ~40s.
    const staggered = await created(ago(100));
    await markRunExecuting(staggered, ago(40).toISOString());

    const wait = async (id: string) => (await db.select({ w: skillRuns.queueWaitMs }).from(skillRuns).where(eq(skillRuns.id, id)))[0].w!;
    expect(Math.round((await wait(plain)) / 1000)).toBe(100);
    expect(Math.round((await wait(staggered)) / 1000)).toBe(40);

    await db.update(skillRuns).set({ status: "success", completedAt: new Date(Date.now() + 30_000) }).where(eq(skillRuns.id, plain));
    const metrics = await getQueueMetrics(24);
    const row = metrics.bySkill.find((r) => r.skillName === skillName)!;
    expect(row.runs).toBe(2);
    expect(row.waitP95Seconds).toBeGreaterThan(90);
    expect(row.runP50Seconds).toBeGreaterThan(25);
    expect(metrics.slowestClients.some((c) => c.engagementId === engagementId)).toBe(true);
  });
});
