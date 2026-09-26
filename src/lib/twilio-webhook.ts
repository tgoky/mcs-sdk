// src/lib/twilio-webhook.ts
//
// The checks every Twilio callback to this app goes through before it's
// believed: the per-client token in the address (the engagement id alone
// is guessable) and Twilio's own signature, keyed by that client's Twilio
// auth token, so only Twilio can post as Twilio.
//
// Twilio signs the exact address it was given. That's the one this app
// built (lib/webhook-url-token.ts webhookUrl with the public app URL); the
// address the request arrived on is also tried, in case the public URL
// changed since the address was handed out.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { checkWebhookToken, webhookUrl } from "@/lib/webhook-url-token";
import { isValidTwilioSignature } from "@/lib/delivery-receipts";
import { hitRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export type TwilioWebhookCheck =
  | { ok: true; fields: Record<string, string>; stack: EngagementStack | null }
  | { ok: false; status: 204 | 401 | 403 | 429 };

export async function verifyTwilioWebhook(req: Request, engagementId: string, path: string): Promise<TwilioWebhookCheck> {
  if (checkWebhookToken(engagementId, req.url) !== "valid") return { ok: false, status: 401 };
  // Twilio retries a 429 later, so a flood is spread out rather than lost.
  if (!(await hitRateLimit(RATE_LIMITS.twilioWebhook, engagementId)).allowed) return { ok: false, status: 429 };

  const [tenant] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (tenant?.stack as EngagementStack | null) ?? null;
  // Nothing of ours to act on; acknowledged so Twilio doesn't retry.
  if (!tenant || stack?.sms_platform !== "twilio") return { ok: false, status: 204 };

  const fields = Object.fromEntries(new URLSearchParams(await req.text()).entries());
  let authToken: string;
  try {
    authToken = await resolveCredential(engagementId, "twilio");
  } catch {
    return { ok: false, status: 403 };
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const candidates = [appUrl ? webhookUrl(appUrl, path, engagementId) : null, req.url].filter((u): u is string => Boolean(u));
  const signature = req.headers.get("x-twilio-signature");
  if (!candidates.some((url) => isValidTwilioSignature(authToken, url, fields, signature))) return { ok: false, status: 403 };
  return { ok: true, fields, stack };
}
