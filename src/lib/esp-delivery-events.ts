// src/lib/esp-delivery-events.ts
//
// Phase 6 — generic bounce/complaint event ingestion, shared by every
// per-platform webhook route (and the SMTP bounce classifier and the
// HubSpot poller, neither of which are "webhooks" in the strict sense
// but feed the same normalized log). Deliberately platform-agnostic: a
// route verifies its own platform's signature, parses its own payload
// shape, then calls recordDeliveryEvent with the normalized result.
//
// Idempotency is NOT this module's job — every caller inserts into
// webhookEvents FIRST (eventSource e.g. "klaviyo-delivery", the
// platform's own event id as idempotencyKey), the same convention every
// other webhook route in this app already follows (see
// booking-event/route.ts). A row only reaches recordDeliveryEvent once
// that insert has already claimed uniqueness — this module trusts its
// callers on that, the same way logStep trusts its callers to have
// already resolved a real runId.

import { db } from "@/lib/db";
import { espDeliveryEvents, winBackEnrollments } from "@/models/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export type DeliveryEventType = "bounced" | "complained";
export type DeliveryPlatform = "klaviyo" | "hubspot" | "activecampaign" | "ghl" | "mailchimp" | "convertkit" | "smtp";

export async function recordDeliveryEvent(
  engagementId: string,
  platform: DeliveryPlatform,
  eventType: DeliveryEventType,
  prospectEmail: string | null,
  occurredAt: Date | null
): Promise<void> {
  await db.insert(espDeliveryEvents).values({
    id: crypto.randomUUID(),
    engagementId,
    platform,
    eventType,
    prospectEmail,
    occurredAt,
  });
}

export interface RollingDeliveryStats {
  bounced: number;
  complained: number;
  /** Rolling-window enrollment count — see esp-delivery-monitor.ts's own
   * comment on why this is used as the sends denominator instead of a
   * true per-touch send count, which isn't visible for the 6 platforms
   * whose cadence automation runs ESP-side. */
  enrollments: number;
}

/** Counts bounce/complaint events AND enrollments in the same rolling
 * window, so the caller can compute a rate without a second round trip.
 * Filters on receivedAt (this app's own clock), not the ESP's own
 * occurredAt — see espDeliveryEvents' own column comment for why. */
export async function getRollingDeliveryStats(engagementId: string, windowDays: number): Promise<RollingDeliveryStats> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [eventRows, enrollmentRows] = await Promise.all([
    db
      .select({ eventType: espDeliveryEvents.eventType, count: sql<number>`count(*)::int` })
      .from(espDeliveryEvents)
      .where(and(eq(espDeliveryEvents.engagementId, engagementId), gte(espDeliveryEvents.receivedAt, since)))
      .groupBy(espDeliveryEvents.eventType),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(winBackEnrollments)
      .where(and(eq(winBackEnrollments.engagementId, engagementId), gte(winBackEnrollments.enrolledAt, since))),
  ]);

  const byType = Object.fromEntries(eventRows.map((r) => [r.eventType, r.count])) as Record<string, number>;
  return {
    bounced: byType.bounced ?? 0,
    complained: byType.complained ?? 0,
    enrollments: enrollmentRows[0]?.count ?? 0,
  };
}
