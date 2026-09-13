// src/lib/whop-agent/alert-cooldown.ts
//
// Shared cooldown bookkeeping on top of the existing activeAlerts table
// (schema.ts's own comment: "last_fired_at for cooldown") — extracted once
// a second Whop Agent alert source (Refund/Dispute Velocity, Section 5.7)
// needed the exact same "don't re-fire the same alert every sweep" logic
// receiver-health-service.ts (Section 7.4) already had, rather than a
// second copy of it.
import { db } from "@/lib/db";
import { activeAlerts } from "@/models/schema";
import { eq } from "drizzle-orm";

export async function alertFiredWithinCooldown(source: string, cooldownHours: number): Promise<boolean> {
  const [row] = await db.select({ lastFiredAt: activeAlerts.lastFiredAt }).from(activeAlerts).where(eq(activeAlerts.source, source)).limit(1);
  if (!row?.lastFiredAt) return false;
  return Date.now() - row.lastFiredAt.getTime() < cooldownHours * 60 * 60 * 1000;
}

export async function recordAlertFired(opts: {
  source: string;
  engagementId: string;
  metricName: string;
  threshold: string;
  severity: string;
}): Promise<void> {
  const existing = await db.select({ id: activeAlerts.id }).from(activeAlerts).where(eq(activeAlerts.source, opts.source)).limit(1);
  if (existing.length > 0) {
    await db.update(activeAlerts).set({ lastFiredAt: new Date(), severity: opts.severity }).where(eq(activeAlerts.id, existing[0].id));
  } else {
    await db.insert(activeAlerts).values({
      engagementId: opts.engagementId,
      metricName: opts.metricName,
      threshold: opts.threshold,
      comparison: "gte",
      evaluationPeriod: "sweep",
      severity: opts.severity,
      source: opts.source,
      lastFiredAt: new Date(),
    });
  }
}
