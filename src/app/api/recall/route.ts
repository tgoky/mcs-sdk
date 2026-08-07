import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversationIntelligenceSessions, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { verifyRecallWebhookSignature, RECALL_NO_SHOW_SUB_CODES } from "@/lib/platforms/conversation-intelligence";
import { inngest, conversationIntelligenceProcess } from "@/lib/inngest";
import { resolveCallOutcome } from "@/features/pre-call-read/server/outcome-resolution";

/**
 * Tier 4 #24 — conversation intelligence hooks (Recall.ai).
 *
 * Same verify-after-resolve pattern as the Slack interactions route:
 * Recall's status-change webhook URL is configured once per Recall
 * workspace, not per engagement, so there's no per-tenant path segment to
 * route on. The bot id in the payload is used for exactly one thing
 * before signature verification passes — looking up which engagement's
 * secret to check the signature against, via
 * conversationIntelligenceSessions (written when the bot was created; see
 * the createRecallBot call site in brief-service.ts).
 *
 * Win-Back no-show gap fix — payload parsing corrected against Recall's
 * live docs (docs.recall.ai/docs/bot-status-change and
 * docs.recall.ai/docs/sub-codes, checked directly, not from memory). The
 * previous extraction read `payload.data?.status?.code`, but a real
 * bot.status_change payload nests the code two levels under
 * `payload.data.data.code` (`payload.data.bot` is the bot, a sibling of
 * `payload.data.data`) — so a genuine "call_ended" event fell through
 * every branch of the old ternary into the "joining" default. That meant
 * a call that had actually ended could sit shown as "joining" in the UI
 * forever, and — the part that mattered for Win-Back — nothing ever
 * looked at the one signal (sub_code) that tells you whether anyone
 * actually joined the call at all. The old plausible-alternate fallbacks
 * are kept for defensiveness, now behind the corrected primary path
 * rather than in front of it.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing Svix signature headers." }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const botId: string | undefined = payload.data?.bot?.id ?? payload.bot?.id ?? payload.data?.bot_id;
  // Primary: payload.event, e.g. "bot.call_ended" / "bot.done" / "bot.fatal"
  // — the top-level field Recall's bot.status_change webhook actually
  // carries. Fall back to the nested data.data.code (also real, same
  // value minus the "bot." prefix), then the old guessed paths last.
  const rawCode: string | undefined =
    payload.event ?? payload.data?.data?.code ?? payload.data?.status?.code ?? payload.data?.status ?? payload.status;
  const statusCode = rawCode?.startsWith("bot.") ? rawCode.slice(4) : rawCode;
  const subCode: string | undefined = payload.data?.data?.sub_code ?? payload.data?.status?.sub_code ?? undefined;

  if (!botId) {
    return NextResponse.json({ error: "Could not resolve a bot id from the payload." }, { status: 400 });
  }

  const [session] = await db
    .select()
    .from(conversationIntelligenceSessions)
    .where(eq(conversationIntelligenceSessions.recallBotId, botId))
    .limit(1);

  if (!session) {
    // No session row means this bot wasn't created by this app (or the
    // row was somehow lost) — nothing to verify against or act on.
    // Acknowledge so Recall stops retrying; there's genuinely nothing to
    // do with an orphaned bot id.
    return NextResponse.json({ success: true, ignored: true });
  }

  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.engagementId, session.engagementId))
    .limit(1);
  const stack = engagement?.stack as EngagementStack | null;
  const signingSecret = stack?.conversation_intelligence_meta?.recall_webhook_signing_secret;

  if (!signingSecret || !verifyRecallWebhookSignature(signingSecret, svixId, svixTimestamp, rawBody, svixSignature)) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  // ── Update session status ───────────────────────────────────────────
  const mappedStatus =
    statusCode === "done"
      ? "done"
      : statusCode === "fatal"
        ? "failed"
        : statusCode === "call_ended"
          ? "call_ended"
          : statusCode === "in_call_recording"
            ? "in_call"
            : "joining";

  await db
    .update(conversationIntelligenceSessions)
    .set({
      status: mappedStatus,
      ...(statusCode === "call_ended" ? { subCode: subCode ?? null } : {}),
      ...(mappedStatus === "done" || mappedStatus === "failed" ? { completedAt: new Date() } : {}),
    })
    .where(eq(conversationIntelligenceSessions.id, session.id));

  // ── Win-Back no-show gap fix — resolve the outcome right here ───────
  // call_ended is the earliest point Recall tells us anything about
  // attendance — no need to wait for "done" (transcript-ready), which can
  // lag call_ended by a while and isn't what outcome resolution needs.
  // Verified no-show sub_codes (docs.recall.ai/docs/sub-codes):
  //   timeout_exceeded_noone_joined        — bot alone in waiting room/call
  //   timeout_exceeded_waiting_room        — never admitted from the lobby
  //   call_ended_by_platform_waiting_room_timeout — same, platform-initiated
  // Any other call_ended sub_code (call_ended_by_host,
  // bot_kicked_from_call, timeout_exceeded_everyone_left, etc.) means the
  // bot was in a live call with people at some point — resolved as
  // "showed". Deliberately NOT resolving anything from "fatal" alone
  // (meeting_not_started, permission errors, etc.) — that's a Recall
  // failure, not evidence either way about attendance; the assumed
  // no-show sweep is the correct fallback for those bookings instead.
  if (statusCode === "call_ended") {
    const resolvedOutcome = subCode && RECALL_NO_SHOW_SUB_CODES.has(subCode) ? "no_show" : "showed";
    await resolveCallOutcome({
      engagementId: session.engagementId,
      bookingId: session.bookingId,
      outcome: resolvedOutcome,
      source: "recall_bot",
    });
  }

  // ── Dispatch transcript processing once the call is actually done ──
  if (mappedStatus === "done") {
    await inngest.send(conversationIntelligenceProcess.create({ engagementId: session.engagementId, sessionId: session.id }));
  }

  return NextResponse.json({ success: true });
}

