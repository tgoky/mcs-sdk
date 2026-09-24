// src/lib/signing-secrets.ts
//
// The secrets this app checks incoming webhooks against: the booking
// webhook's, Slack's, and Recall's. They used to sit in plaintext in
// engagements.stack; they now live encrypted in credentials_refs like
// every API key. A secret still in the stack is moved on first read, so
// existing clients migrate themselves with no script.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq, sql } from "drizzle-orm";
import { hasCredential, resolveCredential, storeCredential } from "@/lib/credentials";
import { patchEngagementStack } from "@/lib/engagement-stack";

export type SigningSecretKind = "booking_webhook" | "slack" | "recall";

const PROVIDER: Record<SigningSecretKind, string> = {
  booking_webhook: "webhook_signing_secret",
  slack: "slack_signing_secret",
  recall: "recall_webhook_signing_secret",
};

/** credentials_refs providers that are signing secrets, not tool keys. */
export const SIGNING_SECRET_PROVIDERS = Object.values(PROVIDER);

function legacyValue(stack: EngagementStack | null, kind: SigningSecretKind): string | null {
  if (!stack) return null;
  const v =
    kind === "booking_webhook" ? stack.webhook_signing_secret : kind === "slack" ? stack.slack_signing_secret : stack.conversation_intelligence_meta?.recall_webhook_signing_secret;
  return typeof v === "string" && v ? v : null;
}

async function clearLegacy(engagementId: string, kind: SigningSecretKind): Promise<void> {
  if (kind === "booking_webhook") await patchEngagementStack(engagementId, { webhook_signing_secret: undefined });
  else if (kind === "slack") await patchEngagementStack(engagementId, { slack_signing_secret: undefined });
  else {
    // Just that one nested key, in SQL, so the rest of the meta is untouched.
    await db
      .update(engagements)
      .set({ stack: sql`coalesce(${engagements.stack}, '{}'::jsonb) #- '{conversation_intelligence_meta,recall_webhook_signing_secret}'` })
      .where(eq(engagements.engagementId, engagementId));
  }
}

const SET_FLAG = { booking_webhook: "webhook_signing_secret_set", slack: "slack_signing_secret_set", recall: "recall_webhook_signing_secret_set" } as const;

export async function setSigningSecret(engagementId: string, kind: SigningSecretKind, value: string): Promise<void> {
  await storeCredential(engagementId, PROVIDER[kind], `secrets://${engagementId}/${PROVIDER[kind]}`, value);
  await patchEngagementStack(engagementId, { [SET_FLAG[kind]]: true });
}

/** The secret, from the vault; one still in the stack is moved there first. */
export async function getSigningSecret(engagementId: string, kind: SigningSecretKind): Promise<string | null> {
  if (await hasCredential(engagementId, PROVIDER[kind])) return resolveCredential(engagementId, PROVIDER[kind]);
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  const legacy = legacyValue(stack, kind);
  if (!legacy || !stack) return null;
  try {
    await setSigningSecret(engagementId, kind, legacy);
    await clearLegacy(engagementId, kind);
  } catch (err) {
    console.error(`[signing-secrets] couldn't move ${kind} secret into the vault for ${engagementId}:`, err);
  }
  return legacy;
}

/** Whether a secret is set, without decrypting it. */
export async function hasSigningSecret(engagementId: string, kind: SigningSecretKind, stack?: EngagementStack | null): Promise<boolean> {
  if (legacyValue(stack ?? null, kind) || stack?.[SET_FLAG[kind]]) return true;
  return hasCredential(engagementId, PROVIDER[kind]);
}
