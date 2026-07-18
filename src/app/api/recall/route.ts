import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversationIntelligenceSessions, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { verifyRecallWebhookSignature } from "@/lib/platforms/conversation-intelligence";
import { inngest, conversationIntelligenceProcess } from "@/lib/inngest";

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

  // Defensive extraction — Recall's exact nesting has shifted across API
  // versions (see the adapter's module comment). Try the documented
  // bot.status_change shape first, fall back to a couple of plausible
  // alternates rather than hard-failing on a version drift this handler
  // can't control.
  const botId: string | undefined = payload.data?.bot?.id ?? payload.bot?.id ?? payload.data?.bot_id;
  const statusCode: string | undefined = payload.data?.status?.code ?? payload.data?.status ?? payload.status;

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
  const signingSecret = (engagement?.stack as EngagementStack | null)?.conversation_intelligence_meta?.recall_webhook_signing_secret;

  if (!signingSecret || !verifyRecallWebhookSignature(signingSecret, svixId, svixTimestamp, rawBody, svixSignature)) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  // ── Update session status ───────────────────────────────────────────
  const mappedStatus =
    statusCode === "done" ? "done" : statusCode === "fatal" ? "failed" : statusCode === "in_call_recording" ? "in_call" : "joining";

  await db
    .update(conversationIntelligenceSessions)
    .set({ status: mappedStatus, ...(mappedStatus === "done" || mappedStatus === "failed" ? { completedAt: new Date() } : {}) })
    .where(eq(conversationIntelligenceSessions.id, session.id));

  // ── Dispatch transcript processing once the call is actually done ──
  if (mappedStatus === "done") {
    await inngest.send(conversationIntelligenceProcess.create({ engagementId: session.engagementId, sessionId: session.id }));
  }

  return NextResponse.json({ success: true });
}
