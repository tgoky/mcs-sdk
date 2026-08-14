import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { OUTCOME_BUTTON_LABEL } from "@/lib/platforms/email";
import { resolveCallOutcome } from "@/features/pre-call-read/server/outcome-resolution";
import { decidePendingAction } from "@/lib/approval-gate";

/**
 * Tier 4 #27 — Slack interactive brief buttons, plus (this round) Queue
 * approve/reject buttons on pendingActions notifications (see
 * queuePendingAction, src/lib/approval-gate.ts). Two interaction types,
 * routed by action_id, sharing one verification path.
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

/** Shared by both interaction types below — see the file header for why the lookup has to come before verification. */
async function verifyEngagementSlackSignature(
  engagementId: string,
  timestamp: string,
  rawBody: string,
  receivedSignature: string
): Promise<boolean> {
  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  const signingSecret = (engagement?.stack as EngagementStack | null)?.slack_signing_secret;
  return Boolean(signingSecret) && verifySlackSignature(signingSecret!, timestamp, rawBody, receivedSignature);
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

  // ── Queue approve/reject (this round) ──────────────────────────────────
  if (action.action_id === "pending_action_approve" || action.action_id === "pending_action_reject") {
    let value: { engagementId?: string; id?: string };
    try {
      value = JSON.parse(action.value ?? "{}");
    } catch {
      return NextResponse.json({ error: "Invalid button value." }, { status: 400 });
    }
    const { engagementId, id } = value;
    if (!engagementId || !id) {
      return NextResponse.json({ error: "Malformed button value." }, { status: 400 });
    }

    if (!(await verifyEngagementSlackSignature(engagementId, timestamp, rawBody, receivedSignature))) {
      return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
    }

    const decision = action.action_id === "pending_action_approve" ? "approved" : "rejected";
    const decidedBy = payload.user?.username ?? payload.user?.id ?? "slack";
    const result = await decidePendingAction(id, decision, decidedBy);

    // Same reasoning as the outcome-button branch below: replace the
    // actions block so a second click can't fire a contradictory decision
    // on an already-decided row.
    if (payload.response_url) {
      const confirmText = !result.ok
        ? result.error
        : result.status === "rejected"
          ? "Rejected"
          : result.executed
            ? "Approved"
            : `Approved, but execution failed: ${result.error}`;
      try {
        await fetch(payload.response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            replace_original: true,
            blocks: [
              ...(payload.message?.blocks?.filter((b: { block_id?: string }) => b.block_id !== "queue_item_actions") ?? []),
              { type: "context", elements: [{ type: "mrkdwn", text: `*${confirmText}*` }] },
            ],
          }),
        });
      } catch {
        // Decision is already recorded — a failure to edit the Slack
        // message is cosmetic, not a reason to fail this request.
      }
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ success: true, status: result.status });
  }

  // ── Pre-call brief outcome buttons (existing) ───────────────────────────
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
  if (!(await verifyEngagementSlackSignature(engagementId, timestamp, rawBody, receivedSignature))) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  // ── Resolve the outcome (Win-Back no-show gap fix) ──────────────────────
  // Previously this just inserted into briefOutcomeLog and stopped — a
  // no_show logged from this exact button never enrolled anyone in
  // Win-Back, and a showed/no_show never removed the prospect from the
  // ad-data cohort. resolveCallOutcome (outcome-resolution.ts) is now the
  // shared path for that; prospectEmail from the button's own value is
  // passed as a hint for engagements briefed before briefedCallsLog
  // started carrying it directly.
  const result = await resolveCallOutcome({
    engagementId,
    bookingId,
    outcome: outcome as "showed" | "no_show" | "rescheduled",
    source: "slack",
    slackUserId: payload.user?.id ?? null,
    prospectEmailHint: prospectEmail ?? null,
  });

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

  return NextResponse.json({ success: true, winBack: result.winBack, cohort: result.cohort });
}
