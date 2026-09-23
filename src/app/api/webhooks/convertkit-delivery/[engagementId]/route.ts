// src/app/api/webhooks/convertkit-delivery/[engagementId]/route.ts
//
// Phase 6 — ConvertKit (Kit) bounce/complaint ingestion for Win-Back's
// auto-pause (esp-delivery-monitor.ts).
//
// VERIFICATION STATUS (see klaviyo-delivery/route.ts's header for why
// this session couldn't WebFetch primary docs):
//   - This app's ConvertKitClient (src/lib/platforms/email.ts) targets
//     API v3 (api.convertkit.com/v3, api_secret-based auth) — CONFIRMED
//     directly from this repo's own code, not a guess.
//   - Most of the research this route drew on (real bounce AND complaint
//     event types, X-Kit-Signature HMAC scheme) was for v4
//     (developers.kit.com/api-reference/webhooks), which this app does
//     NOT use. A direct search specifically for v3 webhooks confirmed
//     v3 webhooks exist (registered via api_secret + target_url + event
//     name) but surfaced NO signature-verification header at all for
//     v3 — the older API appears to predate that feature.
//   - Given that, this route deliberately does NOT claim a signature
//     scheme it can't confirm exists. The engagement-scoped URL itself
//     is the only access control, same posture this exact codebase
//     already takes for the inbound-reply forwarding bridge
//     (src/app/api/webhooks/inbound-reply/[engagementId]/route.ts) — an
//     unguessable per-engagement URL, not a cryptographic signature.
//   - Exact v3 event names for bounce/complaint are UNVERIFIED (v4's
//     `subscriber.subscriber_bounce` / `subscriber.subscriber_complain`
//     may not exist under those names in v3). Matched defensively on
//     substrings below, with the raw payload logged when nothing
//     recognizable is found — the same defensive posture as every other
//     route in this batch, but more load-bearing here given v3's
//     documentation is otherwise thin.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { recordDeliveryEvent } from "@/lib/esp-delivery-events";
import { checkAndApplyAutoPause } from "@/features/win-back/server/esp-delivery-monitor";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) return NextResponse.json({ success: true });

  const stack = tenant.stack as EngagementStack | null;
  if (stack?.email_platform !== "convertkit") return NextResponse.json({ success: true, ignored: true });

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idempotencyKey = crypto.createHash("sha256").update(rawBody).digest("hex");
  const [claimed] = await db
    .insert(webhookEvents)
    .values({ id: crypto.randomUUID(), engagementId, eventSource: "convertkit-delivery", idempotencyKey, eventKind: "unknown" })
    .onConflictDoNothing({ target: [webhookEvents.eventSource, webhookEvents.idempotencyKey] })
    .returning({ id: webhookEvents.id });
  if (!claimed) return NextResponse.json({ success: true, duplicate: true });
  // A failure here answers 500 so the platform retries; the claim row
  // is released first, or the retry would be swallowed as a duplicate.
  try {

    const flat = JSON.stringify(payload).toLowerCase();
    const email = extractEmail(payload);

    if (flat.includes("bounce")) {
      await recordDeliveryEvent(engagementId, "convertkit", "bounced", email, new Date());
      await checkAndApplyAutoPause(engagementId);
    } else if (flat.includes("complain") || flat.includes("spam")) {
      await recordDeliveryEvent(engagementId, "convertkit", "complained", email, new Date());
      await checkAndApplyAutoPause(engagementId);
    } else {
      console.warn(`[convertkit-delivery] Unrecognized event for engagement ${engagementId} — raw payload:`, rawBody.slice(0, 500));
    }

  } catch (err: unknown) {
    console.error("[convertkit-delivery] processing failed; releasing the claim so the retry is handled:", err);
    await db.delete(webhookEvents).where(eq(webhookEvents.id, claimed.id)).catch(() => {});
    return NextResponse.json({ error: "Processing failed. Retry." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

function extractEmail(obj: unknown, depth = 0): string | null {
  if (depth > 4 || obj === null || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of ["email_address", "email"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      const found = extractEmail(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
