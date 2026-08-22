// src/app/api/webhooks/whop/route.ts
//
// Server-side source of truth for "did this Whop membership just turn on
// or off," independent of the buyer ever coming back to log in. Without
// this, provisioning only happens the next time someone completes OAuth
// login (see api/auth/callback), which is fine for access-gating (that
// path re-checks Whop's live Memberships API on every login anyway) but
// means our own `users` row doesn't exist/update until they do — no record
// of a signup that paid but hasn't logged in yet, no way to react to a
// cancellation until their next visit.
//
// Register this URL (https://yourdomain.com/api/webhooks/whop) in Whop
// Dashboard → Developer → Webhooks, subscribed to at least
// membership.activated and membership.deactivated, then copy the signing
// secret into WHOP_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { unwrapWhopWebhook } from "@/lib/whop-webhooks";
import { isRelevantProductId } from "@/lib/whop-access";

export async function POST(request: Request) {
  // Raw text, not request.json() — the signature covers the exact bytes
  // Whop sent. Parsing first (even implicitly, via a body reader that
  // reserializes) breaks verification.
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event;
  try {
    event = unwrapWhopWebhook(rawBody, headers);
  } catch (err) {
    // Bad signature, tampered body, or a stale (>5min) timestamp. Whop
    // doesn't get a payload back on this branch — 401 with no body.
    console.error(
      "[webhooks/whop] Signature verification failed:",
      err instanceof Error ? err.message : String(err)
    );
    return new NextResponse("Invalid signature", { status: 401 });
  }

  if (event.type !== "membership.activated" && event.type !== "membership.deactivated") {
    // We only asked Whop for these two when the webhook was created, but
    // acknowledge anything else cleanly rather than erroring — a dashboard
    // edit that adds another event type shouldn't turn into failed
    // deliveries and Whop's 3-day retry storm.
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const membership = event.data;

  if (!isRelevantProductId(membership.product?.id)) {
    // Same product-under-this-company scoping as checkActiveMembership —
    // a membership event for a different product this Whop company sells
    // has nothing to do with this app's access.
    return NextResponse.json({ received: true, ignored: "product_not_relevant" });
  }

  const user = membership.user;
  if (!user) {
    // Documented edge case: `user` is null if the Whop account was
    // deleted. Nothing to provision against — ack so Whop doesn't retry.
    console.warn(`[webhooks/whop] ${event.type} on ${membership.id} has no user — skipping.`);
    return NextResponse.json({ received: true, ignored: "no_user" });
  }
  const whopUserId = user.id;

  // user.email requires the member:email:read permission on whatever
  // grants this webhook its data; if that permission isn't granted it
  // comes back null and we just leave the existing email (or none) alone
  // rather than clobbering a known email with null.
  const email = user.email ?? undefined;

  try {
    await db
      .insert(users)
      .values({
        whopUserId,
        email,
        subscriptionStatus: membership.status,
      })
      .onConflictDoUpdate({
        target: users.whopUserId,
        set: {
          ...(email ? { email } : {}),
          subscriptionStatus: membership.status,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error(`[webhooks/whop] DB upsert failed for ${whopUserId}:`, err);
    // 500 so Whop retries — this is the one failure mode where a retry
    // actually helps (transient DB blip), unlike a bad signature.
    return NextResponse.json({ error: "db_write_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, whopUserId, status: membership.status });
}
