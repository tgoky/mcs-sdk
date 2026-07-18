import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, briefOutcomeLog, showRateFeatures, type EngagementStack } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { OUTCOME_BUTTON_LABEL } from "@/lib/platforms/email";

/**
 * Tier 4 #27 — Slack interactive brief buttons.
 *
 * Slack's "Interactivity & Shortcuts" Request URL is one URL per Slack
 * app, shared across every engagement that uses Slack delivery — unlike
 * the booking-event webhook route, there's no per-engagement URL path to
 * route on. So verification here has to happen the other way around from
 * every other signed webhook in this codebase: parse the (still
 * untrusted) payload first just far enough to read the engagementId out
 * of the button's `value`, look up THAT engagement's slack_signing_secret,
 * and only then verify the Slack signature against it. Nothing from the
 * payload is trusted or acted on before that verification passes — the
 * engagementId is used for exactly one thing before verification: picking
 * which secret to check the signature against.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySlackSignature(signingSecret: string, timestamp: string, rawBody: string, receivedSignature: string): boolean {
  // Slack's own replay-protection guidance: reject requests more than 5
  // minutes old, independent of whether the signature itself checks out.
  const fiveMinutes = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > fiveMinutes) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed = "v0=" + crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  return safeEqual(computed, receivedSignature);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const receivedSignature = req.headers.get("x-slack-signature");

  if (!timestamp || !receivedSignature) {
    return NextResponse.json({ error: "Missing Slack signature headers." }, { status: 400 });
  }

  // Slack sends interaction payloads as application/x-www-form-urlencoded
  // with a single `payload` field containing the JSON body.
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return NextResponse.json({ error: "Missing payload field." }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return NextResponse.json({ error: "Invalid payload JSON." }, { status: 400 });
  }

  if (payload.type !== "block_actions" || !Array.isArray(payload.actions) || payload.actions.length === 0) {
    // Not an outcome-button click (could be some other interaction type
    // this app doesn't use yet) — acknowledge harmlessly rather than error.
    return NextResponse.json({ success: true, ignored: true });
  }

  const action = payload.actions[0];
  let buttonValue: { engagementId?: string; bookingId?: string; prospectEmail?: string; outcome?: string };
  try {
    buttonValue = JSON.parse(action.value ?? "{}");
  } catch {
    return NextResponse.json({ error: "Invalid button value." }, { status: 400 });
  }

  const { engagementId, bookingId, prospectEmail, outcome } = buttonValue;
  if (!engagementId || !bookingId || !outcome || !(outcome in OUTCOME_BUTTON_LABEL)) {
    return NextResponse.json({ error: "Malformed button value." }, { status: 400 });
  }

  // ── Verify against THIS engagement's signing secret, not before ────────
  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  const signingSecret = (engagement?.stack as EngagementStack | null)?.slack_signing_secret;

  if (!signingSecret || !verifySlackSignature(signingSecret, timestamp, rawBody, receivedSignature)) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  // ── Log the outcome ─────────────────────────────────────────────────────
  await db.insert(briefOutcomeLog).values({
    engagementId,
    bookingId,
    prospectEmail: prospectEmail ?? null,
    outcome,
    loggedBySlackUserId: payload.user?.id ?? null,
  });

  // Tier 4 #25 — feeds the predictive show-rate scorer's training data.
  // Best-effort: a showRateFeatures row only exists when
  // show_rate_scoring_enabled was on for this engagement at brief time, so
  // a miss here is expected and not an error.
  try {
    await db
      .update(showRateFeatures)
      .set({ actualOutcome: outcome, outcomeRecordedAt: new Date() })
      .where(and(eq(showRateFeatures.engagementId, engagementId), eq(showRateFeatures.bookingId, bookingId)));
  } catch {
    // Non-fatal — the outcome is already durably recorded in
    // briefOutcomeLog above regardless of whether a matching features row
    // exists to backfill.
  }

  // Edit the original Slack message via response_url so the buttons don't
  // sit there inviting a second, contradictory click — replaces the
  // actions block with a plain confirmation line.
  if (payload.response_url) {
    try {
      await fetch(payload.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replace_original: true,
          blocks: [
            ...(payload.message?.blocks?.filter((b: any) => b.block_id !== "brief_outcome") ?? []),
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: `Logged: *${OUTCOME_BUTTON_LABEL[outcome as keyof typeof OUTCOME_BUTTON_LABEL]}*` }],
            },
          ],
        }),
      });
    } catch {
      // The outcome is already recorded — a failure to edit the Slack
      // message is a cosmetic miss, not a reason to fail this request.
    }
  }

  return NextResponse.json({ success: true });
}
