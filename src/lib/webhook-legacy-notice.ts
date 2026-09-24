// src/lib/webhook-legacy-notice.ts
//
// Tells a client's owner, once, that one of their tools still calls a
// webhook address without its token, and what to paste instead. See
// lib/webhook-url-token.ts for why the token exists.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "@/lib/notify";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { webhookTokenGraceUntil } from "@/lib/webhook-url-token";

export async function noticeLegacyWebhookAddress(engagementId: string, what: string): Promise<void> {
  try {
    const [row] = await db
      .select({ whopUserId: engagements.whopUserId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .limit(1);
    const stack = (row?.stack as EngagementStack | null) ?? null;
    if (!row?.whopUserId || stack?.webhook_url_legacy_notified_at) return;
    await patchEngagementStack(engagementId, { webhook_url_legacy_notified_at: new Date().toISOString() });
    const until = new Date(webhookTokenGraceUntil()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await notifyUser({
      whopUserId: row.whopUserId,
      engagementId,
      type: "webhook_url_update",
      severity: "warning",
      title: `Update ${row.buyer}'s ${what} address`,
      body: `${row.buyer}'s ${what} still calls the old webhook address. Copy the new one from Win-Back's settings and paste it in. The old address stops working on ${until}; until then its events can't pause sending.`,
    });
  } catch (err) {
    console.error(`[webhook-legacy-notice] couldn't notify for ${engagementId}:`, err);
  }
}
