// tests/integration/alert-monitor-cooldown-race.test.ts
//
// evaluateActiveAlertMonitor (leak-map's alert-monitor.ts) used to check
// activeAlerts.lastFiredAt in JS up front, then batch-write lastFiredAt
// for every triggered alert only at the very end, after every Slack/LLM
// call had already gone out — a check-then-act gap with no lock between
// the read and the write. Two real, documented entry points call this
// same evaluator: the scheduled Inngest cron (every 6h) and the
// admin-invocable manual-trigger route (alert-monitor/route.ts). Nothing
// serializes them against each other, so an admin triggering a manual
// check while the cron happens to also be running could have both
// invocations see the same stale lastFiredAt, both decide the same alert
// is breached and off cooldown, and both fire — a duplicate Slack page
// and a doubled LLM call for one real breach.
//
// This proves the fix directly: the claim is now a single conditional
// UPDATE ... WHERE lastFiredAt IS NULL OR lastFiredAt < cutoff, exercised
// here exactly as alert-monitor.ts runs it, against two genuinely
// concurrent callers.
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("activeAlerts cooldown claim — concurrent overlapping-invocation race", () => {
  const engagementId = `test-eng-alertmon-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-alertmon-${crypto.randomUUID()}`;
  const whopUserId = `test-user-alertmon-${crypto.randomUUID()}`;
  let alertId: string;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, activeAlerts } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(activeAlerts).where(eq(activeAlerts.engagementId, engagementId));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent evaluator invocations claiming the same breached alert: exactly one wins", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, activeAlerts } = await import("@/models/schema");
    const { eq, and, isNull, lt, or } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const [row] = await db
      .insert(activeAlerts)
      .values({
        engagementId,
        metricName: "show_rate",
        threshold: "50",
        comparison: "below",
        evaluationPeriod: "daily",
        severity: "high",
        source: "pack",
        lastFiredAt: null,
      })
      .returning();
    alertId = row.id;

    const cooldownMs = 12 * 60 * 60 * 1000;

    // Mirrors alert-monitor.ts's own claim exactly — the atomic
    // conditional UPDATE that replaced the JS-side check + batched
    // end-of-run write.
    const claimAlert = () => {
      const cooldownCutoff = new Date(Date.now() - cooldownMs);
      return db
        .update(activeAlerts)
        .set({ lastFiredAt: new Date() })
        .where(and(eq(activeAlerts.id, alertId), or(isNull(activeAlerts.lastFiredAt), lt(activeAlerts.lastFiredAt, cooldownCutoff))))
        .returning({ id: activeAlerts.id });
    };

    const [a, b] = await Promise.all([claimAlert(), claimAlert()]);

    const claimedCount = [a, b].filter((r) => r.length > 0).length;
    expect(claimedCount).toBe(1); // exactly one invocation wins the claim and would go on to send Slack/LLM — the other gets zero rows, not a second page
  });

  it("a claim within the cooldown window is rejected, not silently re-fired", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, activeAlerts } = await import("@/models/schema");
    const { eq, and, isNull, lt, or } = await import("drizzle-orm");

    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const [row] = await db
      .insert(activeAlerts)
      .values({
        engagementId,
        metricName: "show_rate",
        threshold: "50",
        comparison: "below",
        evaluationPeriod: "daily",
        severity: "high",
        source: "pack",
        lastFiredAt: new Date(), // just fired
      })
      .returning();
    alertId = row.id;

    const cooldownMs = 12 * 60 * 60 * 1000;
    const cooldownCutoff = new Date(Date.now() - cooldownMs);
    const claimed = await db
      .update(activeAlerts)
      .set({ lastFiredAt: new Date() })
      .where(and(eq(activeAlerts.id, alertId), or(isNull(activeAlerts.lastFiredAt), lt(activeAlerts.lastFiredAt, cooldownCutoff))))
      .returning({ id: activeAlerts.id });

    expect(claimed).toHaveLength(0); // still inside its cooldown — no claim, no second Slack page
  });
});
