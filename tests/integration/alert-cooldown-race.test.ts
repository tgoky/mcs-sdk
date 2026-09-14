// tests/integration/alert-cooldown-race.test.ts
//
// Two overlapping sweeps for the same alert source (a slow previous
// health sweep still finishing when the next 4-hour cron fires, or a
// manual trigger overlapping a scheduled one) used to both pass
// alertFiredWithinCooldown's check before either committed
// recordAlertFired's write — a real check-then-act gap. For
// attemptReenable specifically, that meant two overlapping sweeps could
// both probe the same disabled webhook and both queue a duplicate
// whop_webhook_reenable pending action. claimAlertFiring closes it with a
// Postgres advisory lock keyed by the alert's source string — no schema
// change, since activeAlerts.source has no unique constraint at the
// table level and can't (leak-map's own alert-monitor.ts/notification-
// pack.ts write many rows sharing the literal source "pack").
import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

d("claimAlertFiring — real-database concurrent-sweep race check", () => {
  const engagementId = `test-eng-alert-${crypto.randomUUID()}`;
  const workspaceId = `test-ws-alert-${crypto.randomUUID()}`;
  const whopUserId = `test-user-alert-${crypto.randomUUID()}`;
  const source = `whop:test-alert:${crypto.randomUUID()}`;

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces, activeAlerts } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(activeAlerts).where(eq(activeAlerts.source, source));
    await db.delete(engagements).where(eq(engagements.engagementId, engagementId));
    await db.delete(workspaces).where(eq(workspaces.workspaceId, workspaceId));
  });

  it("two concurrent claims for a source with no existing row: exactly one wins", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const { claimAlertFiring } = await import("@/lib/whop-agent/alert-cooldown");
    const claim = () =>
      claimAlertFiring({ source, cooldownHours: 4, engagementId, metricName: "test_metric", threshold: "1", severity: "warning" });

    const [a, b] = await Promise.all([claim(), claim()]);
    const claimedCount = [a, b].filter(Boolean).length;
    expect(claimedCount).toBe(1);

    const { activeAlerts } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(activeAlerts).where(eq(activeAlerts.source, source));
    // Not two rows from a lost insert-vs-insert race, and not zero from
    // both callers incorrectly bailing.
    expect(rows).toHaveLength(1);
  });

  it("a claim within the cooldown window returns false and does not touch the row", async () => {
    const { db } = await import("@/lib/db");
    const { engagements, workspaces } = await import("@/models/schema");
    await db.insert(workspaces).values({ workspaceId, whopUserId, name: "Test Workspace" });
    await db.insert(engagements).values({ engagementId, whopUserId, workspaceId, buyer: "Test Buyer" });

    const { claimAlertFiring } = await import("@/lib/whop-agent/alert-cooldown");
    const first = await claimAlertFiring({ source, cooldownHours: 4, engagementId, metricName: "test_metric", threshold: "1", severity: "warning" });
    const second = await claimAlertFiring({ source, cooldownHours: 4, engagementId, metricName: "test_metric", threshold: "1", severity: "warning" });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
