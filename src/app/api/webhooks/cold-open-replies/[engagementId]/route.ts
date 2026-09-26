import { NextResponse } from "next/server";
import { checkWebhookToken } from "@/lib/webhook-url-token";
import { rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { parseReplyWebhook } from "@/features/cold-open/server/replies/webhook";
import { storeColdOpenReply } from "@/features/cold-open/server/reply-sort";

/**
 * Where a client's sending tool (Instantly, Smartlead, Lemlist, Reply.io)
 * posts each reply to their cold emails as it arrives. The address carries
 * the client's token; none of these tools signs its webhooks, so the token
 * is what keeps anyone else from posting replies. Sorted and stored exactly
 * as a polled reply is (reply-sort.ts storeColdOpenReply), so an interested
 * reply reaches the Queue within seconds.
 */
export async function POST(req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  if (checkWebhookToken(engagementId, req.url) !== "valid") {
    return NextResponse.json({ error: "This webhook address isn't valid. Copy the current one from Cold Open's setup." }, { status: 401 });
  }
  const limited = await rateLimitResponse(RATE_LIMITS.inboundReply, engagementId);
  if (limited) return limited;

  const config = await getColdOpenConfig(engagementId);
  // Not set up (or removed): acknowledge so the tool doesn't retry forever.
  if (!config) return NextResponse.json({ success: true, ignored: "Cold Open isn't set up for this client." });

  const payload = await req.json().catch(() => null);
  const parsed = parseReplyWebhook(payload);
  if ("ignored" in parsed) return NextResponse.json({ success: true, ignored: parsed.ignored });

  const stored = await storeColdOpenReply(engagementId, parsed.reply, config.productIdentity);
  return NextResponse.json(stored.status === "stored" ? { success: true, disposition: stored.disposition } : { success: true, duplicate: true });
}
