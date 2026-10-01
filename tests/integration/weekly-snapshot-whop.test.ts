// tests/integration/weekly-snapshot-whop.test.ts
//
// The Monday snapshot owned every enabled worker id, including the Whop
// reports it never produces, so a late or rerun snapshot deleted their
// blocks for the week.
import { describe, it, expect, afterAll, vi } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

vi.mock("@/lib/engagement-skills", () => ({ getEnabledWorkerIdsForEngagement: async () => ["pile-on", "whop-weekly-ops-report", "whop-portfolio-rollup"] }));
vi.mock("@/lib/worker-report-blocks", async (orig) => ({
  ...(await orig<typeof import("@/lib/worker-report-blocks")>()),
  getReportBlocksForEngagement: async () => [{ workerId: "pile-on", label: "pile-on", value: 5, displayValue: "5" }],
}));

d("weekly snapshot and the Whop reports", () => {
  const engagementId = `test-eng-snapw-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-snapw-${crypto.randomUUID()}`;
  const whopUserId = `test-user-snapw-${crypto.randomUUID()}`;

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, clientMetricSnapshots } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(clientMetricSnapshots).where(eq(clientMetricSnapshots.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("a snapshot written after the Whop reports keeps their blocks", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, clientMetricSnapshots } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const { recordWeeklySnapshot } = await import("@/lib/client-metric-snapshots");
    const { processWeeklySnapshotForEngagement } = await import("@/features/reports/server/weekly-snapshot");
    const { startOfWeek } = await import("@/lib/dashboard-stats");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    await recordWeeklySnapshot(engagementId, startOfWeek(new Date()), [{ workerId: "whop-weekly-ops-report", label: "ops", value: 7, displayValue: "7" } as never]);
    await processWeeklySnapshotForEngagement(engagementId);

    const [row] = await db.select({ blocks: clientMetricSnapshots.blocks }).from(clientMetricSnapshots).where(eq(clientMetricSnapshots.engagementId, engagementId));
    expect((row.blocks as { workerId: string }[]).map((b) => b.workerId).sort()).toEqual(["pile-on", "whop-weekly-ops-report"]);
  });
});
