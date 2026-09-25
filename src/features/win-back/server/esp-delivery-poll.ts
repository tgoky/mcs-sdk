// src/features/win-back/server/esp-delivery-poll.ts
//
// Phase 6 — HubSpot bounce/complaint polling. Every other platform in
// this Phase 6 batch gets a real webhook route (see
// src/app/api/webhooks/*-delivery/[engagementId]/route.ts); HubSpot
// doesn't, because — per this session's own research pass — HubSpot's
// Webhooks API subscription types are CRM-object-change-based only
// (contact.propertyChange, conversation.*, etc.), not marketing-email-
// delivery events. Bounce/spam-complaint data lives in a separate,
// poll-only legacy Email Events API (HubSpotClient.pollDeliveryEvents,
// email.ts). This module is that honest architecture: a poll fan-out,
// same shape as booking-poller.ts's OnceHub fallback, not a fabricated
// webhook this app can't actually receive.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { HubSpotClient } from "@/lib/platforms/email";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";
import { isEngagementPaused } from "@/lib/engagement-status";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";

const POLL_INTERVAL_MS = 15 * 60_000; // every 15 minutes
const LOOKBACK_MS_IF_NEVER_POLLED = 24 * 60 * 60_000; // first poll ever: last 24h only, not full history

/** Fast, DB-only prep — mirrors booking-poller.ts's findEngagementsDueForPoll split. */
export async function findEngagementsDueForHubspotDeliveryPoll(): Promise<string[]> {
  const rows = await db
    .select({ engagementId: engagements.engagementId, stack: engagements.stack, pausedAt: engagements.pausedAt, deletedAt: engagements.deletedAt })
    .from(engagements)
    .where(and(sql`${engagements.stack}->>'email_platform' = 'hubspot'`, isNull(engagements.deletedAt)));

  const now = Date.now();
  const due: string[] = [];
  for (const row of rows) {
    if (isEngagementPaused(row)) continue;
    const stack = row.stack as EngagementStack | null;
    if (!stack?.email_platform_credentials_ref) continue;
    if (!(await isSkillEnabledForEngagement(row.engagementId, "win-back"))) continue;
    const watermark = stack.hubspot_delivery_poll_watermark_ms ?? 0;
    if (watermark === 0 || now - watermark >= POLL_INTERVAL_MS) due.push(row.engagementId);
  }
  return due;
}

/** One engagement's poll pass — both event types, watermark advance. */
export async function pollHubspotDeliveryForEngagement(engagementId: string): Promise<{ bounced: number; complained: number }> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? ({} as EngagementStack);
  if (stack.email_platform !== "hubspot") return { bounced: 0, complained: 0 };

  const now = Date.now();
  const since = stack.hubspot_delivery_poll_watermark_ms || now - LOOKBACK_MS_IF_NEVER_POLLED;

  let bounced = 0;
  let complained = 0;
  try {
    const apiKey = await resolveCredential(engagementId, "hubspot");
    const client = new HubSpotClient(apiKey);

    const [bounces, complaints] = await Promise.all([
      client.pollDeliveryEvents("BOUNCE", since),
      client.pollDeliveryEvents("SPAMREPORT", since),
    ]);

    for (const e of bounces) {
      await recordDeliveryEvent(engagementId, "hubspot", "bounced", e.email, e.occurredAtMs ? new Date(e.occurredAtMs) : null);
      bounced++;
    }
    for (const e of complaints) {
      await recordDeliveryEvent(engagementId, "hubspot", "complained", e.email, e.occurredAtMs ? new Date(e.occurredAtMs) : null);
      complained++;
    }

    if (bounced + complained > 0) await checkAndApplyAutoPause(engagementId);
  } catch (err) {
    console.error(`[esp-delivery-poll] HubSpot poll failed for ${engagementId} — watermark NOT advanced, will retry from the same point next cycle:`, err);
    return { bounced: 0, complained: 0 };
  }

  // Watermark only advances on a successful poll — a failed poll (caught
  // above) intentionally leaves it where it was so the next cycle
  // re-covers the same window rather than silently skipping it.
  //
  // Only the watermark key is written. checkAndApplyAutoPause above sets
  // win_back_auto_paused on the same stack column; writing back the copy
  // read at the top of this function would erase that pause the moment it
  // was applied.
  await patchEngagementStack(engagementId, { hubspot_delivery_poll_watermark_ms: now });

  return { bounced, complained };
}
