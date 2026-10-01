// tests/integration/weekly-snapshot-merge.test.ts
//
// One client_metric_snapshots row per client per week is shared by the
// Monday snapshot (every enabled worker) and Whop Agent's own reports
// later in the week. Each used to replace the whole row, so the Whop
// reports wiped every other worker's numbers for that week.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("weekly snapshot merge", () => {
  const engagementId = `test-eng-snap-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-snap-${crypto.randomUUID()}`;
  const whopUserId = `test-user-snap-${crypto.randomUUID()}`;
  const weekStart = new Date("2026-09-28T00:00:00Z");
  const block = (workerId: string, value: number) => ({ workerId, label: workerId, value, displayValue: String(value) }) as never;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, clientMetricSnapshots } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(clientMetricSnapshots).where(eq(clientMetricSnapshots.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("keeps every writer's blocks, including two writing at once", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, clientMetricSnapshots } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { recordWeeklySnapshot } = await import("@/lib/client-metric-snapshots");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });
    const read = async () => {
      const [row] = await db.select({ blocks: clientMetricSnapshots.blocks }).from(clientMetricSnapshots).where(eq(clientMetricSnapshots.engagementId, engagementId));
      return (row.blocks as { workerId: string; value: number }[]).map((b) => `${b.workerId}=${b.value}`).sort();
    };

    // Monday: every enabled worker, one of which has nothing yet.
    await recordWeeklySnapshot(engagementId, weekStart, [block("pile-on", 10), block("win-back", 4)], ["pile-on", "win-back", "leak-map"]);
    // Later: both Whop reports land at the same moment.
    await Promise.all([
      recordWeeklySnapshot(engagementId, weekStart, [block("whop-weekly-ops-report", 7)]),
      recordWeeklySnapshot(engagementId, weekStart, [block("whop-portfolio-rollup", 3)]),
    ]);
    expect(await read()).toEqual(["pile-on=10", "whop-portfolio-rollup=3", "whop-weekly-ops-report=7", "win-back=4"]);

    // A rerun of the ops report replaces only its own block.
    await recordWeeklySnapshot(engagementId, weekStart, [block("whop-weekly-ops-report", 8)]);
    // Monday rerun: win-back has nothing now, so its old block goes.
    await recordWeeklySnapshot(engagementId, weekStart, [block("pile-on", 11)], ["pile-on", "win-back", "leak-map"]);
    expect(await read()).toEqual(["pile-on=11", "whop-portfolio-rollup=3", "whop-weekly-ops-report=8"]);
  });
});
