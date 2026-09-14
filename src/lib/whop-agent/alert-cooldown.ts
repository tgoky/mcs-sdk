// src/lib/whop-agent/alert-cooldown.ts
//
// Shared cooldown bookkeeping on top of the existing activeAlerts table
// (schema.ts's own comment: "last_fired_at for cooldown") — extracted once
// a second Whop Agent alert source (Refund/Dispute Velocity, Section 5.7)
// needed the exact same "don't re-fire the same alert every sweep" logic
// receiver-health-service.ts (Section 7.4) already had, rather than a
// second copy of it.
//
// activeAlerts.source has no unique constraint at the schema level — it
// can't: leak-map's own alert-monitor.ts/notification-pack.ts write many
// rows sharing the literal source "pack", a completely different, non-
// unique usage of the same column. So this can't be closed with a unique
// index the way whop_webhook_registry's race was; a Postgres advisory
// lock keyed by the source string gives the same all-or-nothing guarantee
// without touching the table's shape or leak-map's unrelated rows.
//
// Both callers (receiver-health-service.ts, refund-dispute-velocity-
// service.ts) used to call alertFiredWithinCooldown, then separately
// recordAlertFired, with their own if-check between the two — a real
// check-then-act gap: two overlapping sweeps for the same source (a slow
// previous run still finishing when the next cron fires, a manual sweep
// overlapping the scheduled one) could both see "not in cooldown" and
// both fire, double-notifying the operator. claimAlertFiring collapses
// that into one atomic call so there's no gap left for a caller to
// reopen.
import { db } from "@/lib/db";
import { activeAlerts } from "@/models/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

function lockKeyFor(source: string): bigint {
  // pg_advisory_xact_lock takes a signed 64-bit integer. Truncating a
  // hash to 8 bytes and reading it as a signed bigint is a stable,
  // collision-resistant-enough mapping from an arbitrary source string
  // to that keyspace — this only needs to serialize callers racing on
  // the exact same source string, not provide cryptographic guarantees.
  const hash = crypto.createHash("sha256").update(source).digest();
  return hash.readBigInt64BE(0);
}

/**
 * Atomically checks whether `source` is still in cooldown and, if not,
 * records that it just fired — all inside one Postgres transaction-scoped
 * advisory lock keyed by `source`, so a second concurrent caller for the
 * same source blocks until the first transaction commits, then sees the
 * just-recorded lastFiredAt and correctly returns false instead of racing
 * past the same stale read. Returns true only for the caller that should
 * actually go on to notify the operator.
 */
export async function claimAlertFiring(opts: {
  source: string;
  cooldownHours: number;
  engagementId: string;
  metricName: string;
  threshold: string;
  severity: string;
}): Promise<boolean> {
  const lockKey = lockKeyFor(opts.source);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);

    const [existing] = await tx.select().from(activeAlerts).where(eq(activeAlerts.source, opts.source)).limit(1);

    if (existing?.lastFiredAt) {
      const withinCooldown = Date.now() - existing.lastFiredAt.getTime() < opts.cooldownHours * 60 * 60 * 1000;
      if (withinCooldown) return false;
    }

    if (existing) {
      await tx.update(activeAlerts).set({ lastFiredAt: new Date(), severity: opts.severity }).where(eq(activeAlerts.id, existing.id));
    } else {
      await tx.insert(activeAlerts).values({
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

    return true;
  });
}
