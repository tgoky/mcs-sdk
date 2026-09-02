// src/lib/chat-credentials.ts
//
// The piece create_client left out on purpose: getting a client from
// "just a name" to "actually has a credential wired up and can run."
// Provider-agnostic by design — booking_platform vs email_platform is
// just a `stackField` argument, so wiring this up for email later is a
// system-prompt change, not new code here.
//
// One deliberate omission, and it's a security decision, not a scope cut:
// there is no "paste a raw API key" path in here. Chat messages
// (chat_threads/chat_messages) are plain text/jsonb, unencrypted, and
// every user turn is sent to the LLM API as conversation content — that's
// a fundamentally different trust boundary than storeCredential()'s
// AES-256-GCM-encrypted-at-rest path the wizard's CredentialField uses.
// A raw secret typed into a chat message would sit in plaintext in
// chat_messages.raw_content/display_text *and* transit as part of a
// message sent to Anthropic's API — neither is true of the wizard's paste
// mode. So paste-a-key still routes to the engagement's own page (the
// same "finish setup" link create_client already surfaces), same as
// Composio connect already had to be a real link-and-redirect rather than
// something the model does inline. Reuse-a-saved-credential and
// connect-via-Composio are both safe to do conversationally — neither
// ever puts a secret value in chat content — so those are what's built
// here.

import { db } from "@/lib/db";
import { engagements, credentialsRefs, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { linkEngagementToVault, listVaultCredentials } from "@/lib/credentials";
import { isComposioManagedProvider, startComposioConnect } from "@/lib/composio";

type StackField = "booking" | "email";

const REF_SUFFIX: Record<StackField, string> = { booking: "pat", email: "key" };
const PLATFORM_KEY: Record<StackField, "booking_platform" | "email_platform"> = {
  booking: "booking_platform",
  email: "email_platform",
};
const REF_KEY: Record<StackField, "booking_platform_credentials_ref" | "email_platform_credentials_ref"> = {
  booking: "booking_platform_credentials_ref",
  email: "email_platform_credentials_ref",
};

export async function hasBookingCredential(engagementId: string, workspaceId: string): Promise<boolean> {
  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  const stack = engagement?.stack as Partial<EngagementStack> | null | undefined;
  return Boolean(stack?.booking_platform_credentials_ref);
}

export async function checkCredentialAvailability(workspaceId: string, engagementId: string, provider: string) {
  const [existing] = await db
    .select({ id: credentialsRefs.id })
    .from(credentialsRefs)
    .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)))
    .limit(1);
  if (existing) return { alreadyLinked: true as const, reusable: null };

  const vaultRows = await listVaultCredentials(workspaceId, provider);
  const mostRecent = vaultRows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return { alreadyLinked: false as const, reusable: mostRecent ? { id: mostRecent.id, label: mostRecent.label } : null };
}

// Mirrors setup/route.ts's own transaction exactly: link (or re-verify),
// then re-derive the credentials_ref string from credentialsRefs itself
// rather than trust anything computed ahead of the write — same FIX that
// route's own comment documents. stack is read-merged, not overwritten,
// so a booking link doesn't clobber an email one set in an earlier turn.
export async function linkReusableCredential(opts: {
  engagementId: string;
  workspaceId: string;
  provider: string;
  field: StackField;
  vaultId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [engagement] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, opts.engagementId), eq(engagements.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!engagement) return { ok: false, error: "Client not found." };

  await db.transaction(async (tx) => {
    await linkEngagementToVault(opts.engagementId, opts.provider, opts.vaultId, tx);

    const [linked] = await tx
      .select({ id: credentialsRefs.id })
      .from(credentialsRefs)
      .where(and(eq(credentialsRefs.engagementId, opts.engagementId), eq(credentialsRefs.provider, opts.provider)))
      .limit(1);

    const refString = linked ? `secrets://${opts.engagementId}/${opts.provider}_${REF_SUFFIX[opts.field]}` : undefined;
    const mergedStack: Partial<EngagementStack> = {
      ...(engagement.stack as Partial<EngagementStack> | null),
      [PLATFORM_KEY[opts.field]]: opts.provider,
      [REF_KEY[opts.field]]: refString,
    };

    await tx
      .update(engagements)
      .set({ stack: mergedStack as EngagementStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, opts.engagementId));
  });

  return { ok: true };
}

export async function getComposioConnectLink(opts: {
  provider: string;
  workspaceId: string;
  origin: string;
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string }> {
  if (!isComposioManagedProvider(opts.provider)) {
    return { ok: false, error: `${opts.provider} isn't a Composio-managed connection — it needs a pasted key instead.` };
  }
  const callbackUrl = new URL("/api/composio/callback", opts.origin);
  callbackUrl.searchParams.set("provider", opts.provider);
  // /dashboard/teammates is on the return allowlist (composio.ts) — no
  // engagementId/threadId threaded through it on purpose. The thread this
  // browser was last in survives the round trip via the same localStorage
  // key active-thread-storage.ts already persists across any full-page
  // navigation, and the model still has the engagement in its own
  // conversation history to act on once it's told "connected" — nothing
  // extra needs smuggling through the OAuth redirect itself.
  callbackUrl.searchParams.set("returnTo", "/dashboard/teammates");

  const { redirectUrl } = await startComposioConnect(opts.provider, opts.workspaceId, callbackUrl.toString());
  return { ok: true, redirectUrl };
}
