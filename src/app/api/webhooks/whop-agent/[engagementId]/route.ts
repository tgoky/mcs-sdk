import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookEvents } from "@/models/schema";
import { getAgentWebhookSecrets } from "@/features/whop-agent/server/webhook-subscription-service";
import { verifyWhopWebhookSignature } from "@/lib/whop-agent/webhook-verify";
import { inngest, whopWebhookProcess } from "@/lib/inngest";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

// Section 7.3: "2xx within 5 seconds. Timeouts, error statuses, and
// redirects all count as failures." This route does signature
// verification (one HMAC compute per candidate secret), a dedup insert,
// and one Inngest send — all DB-only or cheap-CPU work, comfortably inside
// the deadline. Any real per-event processing happens in
// src/inngest/whop-agent.ts, fully decoupled from this response.
export const maxDuration = 10;

/**
 * Section 7.1-7.3: the multi-tenant Whop webhook receiver. One route per
 * engagement (the URL itself is the routing key — Whop gives us nothing
 * else to route on), signature-verified against that engagement's own
 * agent-created subscription secret(s), never the single global secret
 * whop-webhooks.ts uses for this app's own product webhooks.
 */
export async function POST(request: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;

  // Read the raw body FIRST — the signature covers the exact bytes Whop
  // sent; parsing before verifying breaks the check (same rule
  // whop-webhooks.ts's own doc comment states).
  const rawBody = await request.text();

  const secrets = await getAgentWebhookSecrets(engagementId);
  if (secrets.length === 0) {
    // Either this engagement never had an agent-created subscription, or
    // it was torn down on disconnect (Section 2.7). Either way there's
    // nothing to verify against — reject rather than trust an unverifiable
    // payload.
    return new Response("No verifiable webhook subscription on file for this engagement.", { status: 401 });
  }

  const headers = {
    webhookId: request.headers.get("webhook-id"),
    webhookTimestamp: request.headers.get("webhook-timestamp"),
    webhookSignature: request.headers.get("webhook-signature"),
  };

  let verifiedWhopWebhookId: string | null = null;
  let lastReason = "No candidate secret verified this signature.";
  for (const { whopWebhookId, secret } of secrets) {
    const result = verifyWhopWebhookSignature(rawBody, headers, secret);
    if (result.ok) {
      verifiedWhopWebhookId = whopWebhookId;
      break;
    }
    lastReason = result.reason;
  }

  if (!verifiedWhopWebhookId) {
    console.warn(`[whop-agent webhook] Signature verification failed for engagement ${engagementId}: ${lastReason}`);
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let envelope: { type?: string; api_version?: string; data?: Record<string, unknown>; previous_attributes?: Record<string, unknown> };
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed JSON body.", { status: 400 });
  }

  // Section 7.1/7.2: envelopes with api_version v2 or v5 lack Standard
  // Webhooks signatures and can't be verified — the agent never creates
  // them, and rejects any that arrive regardless of how they got a
  // (necessarily agent-issued) secret in the first place.
  if (envelope.api_version && envelope.api_version !== "v1") {
    return new Response(`Unverifiable envelope api_version "${envelope.api_version}" rejected.`, { status: 400 });
  }
  if (!envelope.type) {
    return new Response("Envelope missing type.", { status: 400 });
  }

  // receiver-health-service.ts's re-enable probe (Section 7.4) signs a
  // synthetic envelope with this type to verify the receiver itself is
  // reachable and signature-valid, without it landing in the real
  // dedup ledger or triggering a real event-processing run.
  if (envelope.type === "whop_agent.health_probe") {
    return NextResponse.json({ success: true, probe: true });
  }

  // Dedup on webhook-id — retries reuse the same id (Section 7.3).
  try {
    await db.insert(webhookEvents).values({
      engagementId,
      eventSource: `whop:${verifiedWhopWebhookId}`,
      idempotencyKey: headers.webhookId!,
      eventKind: envelope.type,
    });
  } catch (dedupErr: unknown) {
    if (isUniqueConstraintViolation(dedupErr)) {
      return NextResponse.json({ success: true, deduplicated: true });
    }
    const message = dedupErr instanceof Error ? dedupErr.message : String(dedupErr);
    console.error("[whop-agent webhook] Idempotency check failed (non-fatal):", message);
  }

  await inngest.send(
    whopWebhookProcess.create({
      engagementId,
      whopWebhookId: verifiedWhopWebhookId,
      envelope: { type: envelope.type, data: envelope.data, previous_attributes: envelope.previous_attributes },
      occurredAtIso: new Date().toISOString(),
    })
  );

  return NextResponse.json({ success: true });
}
