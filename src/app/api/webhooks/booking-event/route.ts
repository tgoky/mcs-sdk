import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, webhookEvents, type EngagementStack } from "@/models/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { classifyBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { deriveWebhookIdempotencyKey } from "@/lib/platforms/booking";
import { startRun, failRun } from "@/lib/run-log";
import { gateOrExecute } from "@/lib/approval-gate";
import { inngest, bookingWebhookProcess } from "@/lib/inngest";
import crypto from "crypto";

// Reliability fix: this route now only does DB-only work (signature verify,
// idempotency insert, rate-limit check, startRun, an Inngest event send) —
// no ESP calls, no LLM calls. 15s is generous headroom over that, and stays
// comfortably inside every booking platform's webhook ack deadline
// (Calendly's is ~10s). See src/lib/inngest.ts's bookingWebhookProcess
// comment for the full reasoning — the actual enrollment work now happens
// in src/inngest/booking-webhook.ts, fully decoupled from this deadline.
export const maxDuration = 15;

// Rate limiting — cross-cutting recovery gap, AI Architect Review flag.
// Nothing previously stopped a webhook replay storm (malicious, or a
// booking-platform bug re-firing the same events) from enrolling hundreds
// of prospects in minutes on a buyer's own ESP account, which is what gets
// *their* Klaviyo/HubSpot account flagged — not ours, but they'll blame us.
// Deliberately scoped per-engagement, not global, so one noisy tenant can't
// throttle everyone else. A 429 is the correct response here rather than a
// silent drop: Calendly (and the other supported platforms) retry
// non-2xx responses with backoff for up to 24h, so a legitimate burst just
// gets spread out over time instead of lost.
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_EVENTS_PER_WINDOW = 50;

// ── Signature verification helpers ─────────────────────────────────────────

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Returns false immediately if lengths differ (safe — length is public info).
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Calendly webhook signature verification.
 * Header format: Calendly-Webhook-Signature: t=<timestamp>,v1=<signature>
 * Computed as: HMAC-SHA256(secret, timestamp + "." + rawBody)
 */
function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  let t = "";
  let v1 = "";
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "t") t = val;
    if (key === "v1") v1 = val;
  }

  if (!t || !v1) return false;

  // Reject timestamps older than 3 minutes (replay attack prevention)
  const threeMinutesSec = 3 * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - parseInt(t, 10) > threeMinutesSec) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  return safeEqual(v1, expected);
}

/**
 * Cal.com webhook signature verification.
 * Header: x-calcom-signature-256: sha256=<signature>
 * Computed as: HMAC-SHA256(secret, rawBody)
 */
function verifyCalComSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const provided = signatureHeader.replace(/^sha256=/, "");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqual(provided, expected);
}

/**
 * Generic HMAC-SHA256 verification for GHL / OnceHub / unknown providers
 * that pass an X-Signature header with hex-encoded HMAC of the raw body.
 */
function verifyGenericHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqual(signatureHeader, expected);
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const runId = crypto.randomUUID();

  try {
    // ── 1. Read raw body FIRST (needed for signature verification) ──
    const rawBody = await request.text();

    // ── 2. Extract engagement_id from query params ──
    // This is just a routing key, not authentication — the signature proves authenticity.
    const { searchParams } = new URL(request.url);
    const engagementId = searchParams.get("engagement_id");

    if (!engagementId) {
      return new Response("Missing engagement_id parameter", { status: 400 });
    }

    // ── 3. Look up tenant to retrieve signing secret ──
    const tenant = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .then((r) => r[0]);

    if (!tenant) {
      return new Response("Engagement not found", { status: 404 });
    }

    // ── 4. VERIFY SIGNATURE before touching any data ──
    const stack = tenant.stack as EngagementStack | null;
    const signingSecret = stack?.webhook_signing_secret;
    const platform = stack?.booking_platform ?? "unsupported";

    if (!signingSecret) {
      console.error(
        `[webhook] No signing secret configured for engagement ${engagementId} (platform: ${platform})`
      );
      return new Response(
        "Webhook signing secret not configured",
        { status: 401 }
      );
    }

    let signatureValid = false;

    switch (platform) {
      case "calendly": {
        const header = request.headers.get("calendly-webhook-signature");
        signatureValid = verifyCalendlySignature(rawBody, header, signingSecret);
        break;
      }
      case "cal_com": {
        const header = request.headers.get("x-calcom-signature-256");
        signatureValid = verifyCalComSignature(rawBody, header, signingSecret);
        break;
      }
      case "ghl_calendar":
      case "oncehub": {
        // These typically send X-Signature or X-Webhook-Signature
        const header =
          request.headers.get("x-signature") ??
          request.headers.get("x-webhook-signature");
        signatureValid = verifyGenericHmacSignature(rawBody, header, signingSecret);
        break;
      }
      case "unsupported":
      default: {
        // For truly unknown platforms, we can't verify — reject rather than trust
        console.error(
          `[webhook] Cannot verify signature for unsupported platform: ${platform}`
        );
        return new Response(
          "Unsupported booking platform — no verification method available",
          { status: 401 }
        );
      }
    }

    if (!signatureValid) {
      console.warn(
        `[webhook] Signature verification FAILED for engagement ${engagementId}`
      );
      return new Response("Invalid webhook signature", { status: 401 });
    }

    // ── 5. NOW parse the verified payload and process ──
    const payload = JSON.parse(rawBody);

    const eventKind = classifyBookingEvent(payload);
    const skillName = eventKind === "cancelled" ? "win-back" : "pile-on";

    // ── 6. Idempotency check — AI Architect Review's #1 webhook fix ──
    // Calendly (and every other booking platform here) retries on a slow
    // or failed response. Without this, a retry re-runs
    // handleInboundBookingEvent end-to-end and double-enrolls the same
    // prospect (and, in hybrid mode, double-fires the personalized intro
    // send). The key is derived from the payload itself (invitee URI for
    // Calendly, booking UID for Cal.com, etc.) — see
    // deriveWebhookIdempotencyKey in booking.ts — so a genuine retry of
    // the exact same event always collides on the same key regardless of
    // how many times it's redelivered.
    const idempotencyKey = deriveWebhookIdempotencyKey(platform, payload);
    if (idempotencyKey) {
      try {
        await db.insert(webhookEvents).values({
          engagementId: tenant.engagementId,
          eventSource: platform,
          idempotencyKey,
          eventKind,
        });
      } catch (dedupErr: unknown) {
        // Unique constraint violation on (event_source, idempotency_key)
        // means we've already accepted this exact event — this is a
        // retry, not a new booking. Acknowledge with 200 so the platform
        // stops retrying, but do NOT run enrollment again.
        const dedupErrCode =
          dedupErr && typeof dedupErr === "object" && "code" in dedupErr
            ? (dedupErr as { code?: string }).code
            : undefined;
        const dedupErrMessage = dedupErr instanceof Error ? dedupErr.message : String(dedupErr);
        if (dedupErrCode === "23505" || /duplicate key|unique/i.test(dedupErrMessage)) {
          console.log(
            `[webhook] Duplicate delivery ignored (idempotency key: ${idempotencyKey}) for engagement ${engagementId}`
          );
          return NextResponse.json({ success: true, deduplicated: true });
        }
        // Any other DB error dedup-checking shouldn't block a legitimate
        // booking from being processed — log and fall through.
        console.error("[webhook] Idempotency check failed (non-fatal):", dedupErrMessage);
      }
    } else {
      console.warn(
        `[webhook] Could not derive an idempotency key for platform "${platform}" — proceeding without dedup for this event.`
      );
    }

    // ── 6b. Rate limit — reject if this engagement has seen an unusual
    // burst of events recently. Counts rows already durably inserted into
    // webhook_events above, so this reuses the idempotency insert instead
    // of standing up a separate counter table. A tripped limit returns 429
    // rather than silently dropping the event or enrolling anyway.
    const [{ recentCount }] = await db
      .select({ recentCount: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.engagementId, tenant.engagementId),
          gt(webhookEvents.receivedAt, new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000))
        )
      );

    if (recentCount > RATE_LIMIT_MAX_EVENTS_PER_WINDOW) {
      console.warn(
        `[webhook] Rate limit exceeded for engagement ${engagementId}: ${recentCount} events in the last ${RATE_LIMIT_WINDOW_MINUTES}m (limit ${RATE_LIMIT_MAX_EVENTS_PER_WINDOW}).`
      );
      return new Response(
        "Rate limit exceeded for this engagement — too many booking events in a short window. This event will be retried automatically by the sending platform.",
        { status: 429, headers: { "Retry-After": "120" } }
      );
    }

    // ── Cross-cutting recovery gap 22: explicit human-approval gates ─────
    // See src/lib/approval-gate.ts. Gate is off by default (today's
    // behavior, unchanged); an operator opts a specific engagement into
    // review-before-enroll via require_approval_for_side_effects. Reuses
    // `stack`, already derived from `tenant.stack` above.
    const gateResult = await gateOrExecute(
      stack,
      tenant.engagementId,
      "webhook_enrollment",
      { bookingPayload: payload, eventKind },
      async () => {
        await startRun({
          id: runId,
          engagementId: tenant.engagementId,
          skillName,
          phase: "webhook_received",
          label: payload.event ?? payload.trigger ?? "booking event",
        });
        // Reliability fix: dispatch instead of awaiting the work itself.
        // inngest.send() is a single fast network call to Inngest's own
        // ingest API — the actual ESP enrollment, ad-data cohort sync, and
        // hybrid personalization now run in src/inngest/booking-webhook.ts,
        // fully decoupled from this request/response cycle. See the
        // module comment on bookingWebhookProcess in src/lib/inngest.ts.
        await inngest.send(
          bookingWebhookProcess.create({
            runId,
            engagementId: tenant.engagementId,
            eventKind,
            bookingPayload: payload,
          })
        );
      }
    );

    if (!gateResult.executed) {
      // Webhook is still ack'd with 200 — the platform's delivery
      // contract is satisfied; the pending action, not the webhook retry
      // mechanism, is now what's tracking this booking.
      return NextResponse.json({ success: true, pendingApproval: true, pendingActionId: gateResult.pendingActionId });
    }

    return NextResponse.json({ success: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[webhook] booking-event failure:", message);
    await failRun(runId, error, {
      summary: {
        whatWasAttempted: ["Process inbound booking webhook event."],
        whatWorked: [],
        whatFailed: [message],
        openItems: [
          "This booking event was not enrolled in any sequence — check the payload shape against the configured booking platform.",
        ],
        decisionsMade: [],
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}