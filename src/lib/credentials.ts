import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { credentialsRefs, credentialVault, engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { connectedAccountIdFromRefKey, composioVaultRefKey, deleteComposioConnection, getComposioCredentialValue } from "@/lib/composio";

// Either the module-level pooled db, or the `tx` handle inside a
// db.transaction() callback — both expose the same select/insert/update
// surface storeCredential uses. Lets callers fold credential writes into a
// wider transaction (see engagements/setup route) instead of forcing every
// call site onto its own implicit auto-commit statement.
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Key-rotation support ─────────────────────────────────────────────────
// Previously a single hardcoded ENCRYPTION_KEY: every credential ever
// stored was encrypted with whatever CREDENTIAL_ENCRYPTION_KEY happened to
// be set, with no record of which one. If that key ever leaked or needed
// rotating for any reason, the only recovery path was asking every
// customer to re-enter every credential — there was no way to decrypt old
// rows with an old key while writing new rows with a new one.
//
// Fix: credentials_refs.keyVersion records which key encrypted each row.
// CREDENTIAL_ENCRYPTION_KEY is always the *current* key, addressed by
// CREDENTIAL_ENCRYPTION_KEY_VERSION (defaults to 1, so existing
// deployments with no rotation configured behave exactly as before — every
// row is version 1, decrypted with CREDENTIAL_ENCRYPTION_KEY, same as
// today). To rotate: set CREDENTIAL_ENCRYPTION_KEY_V<old version> to the
// key being retired, bump CREDENTIAL_ENCRYPTION_KEY to a freshly generated
// key, and bump CREDENTIAL_ENCRYPTION_KEY_VERSION. New writes use the new
// key immediately; existing rows keep decrypting fine against the old key
// until they're next re-saved (storeCredential always writes at the
// current version), at which point they migrate onto the new key.
const CURRENT_KEY_VERSION = Number(process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION ?? "1");

function loadEncryptionKeys(): Map<number, string> {
  const keys = new Map<number, string>();
  if (process.env.CREDENTIAL_ENCRYPTION_KEY) {
    keys.set(CURRENT_KEY_VERSION, process.env.CREDENTIAL_ENCRYPTION_KEY);
  }
  // Older, rotated-out keys: CREDENTIAL_ENCRYPTION_KEY_V1, _V2, etc.
  // Decrypt-only — encrypt() always uses CURRENT_KEY_VERSION.
  for (const [envKey, value] of Object.entries(process.env)) {
    const match = envKey.match(/^CREDENTIAL_ENCRYPTION_KEY_V(\d+)$/);
    if (match && value) {
      keys.set(Number(match[1]), value);
    }
  }
  return keys;
}

const ENCRYPTION_KEYS = loadEncryptionKeys();

function getKeyForVersion(version: number): string {
  const key = ENCRYPTION_KEYS.get(version);
  if (!key || key.length !== 64) {
    throw new Error(
      version === CURRENT_KEY_VERSION
        ? "CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32"
        : `No usable key configured for credential encryption key version ${version}. ` +
          `Set CREDENTIAL_ENCRYPTION_KEY_V${version} to the retired key (64-char hex) to keep decrypting rows written with it.`
    );
  }
  return key;
}

/**
 * Encrypts a credential value for storage. Always encrypts against the
 * current key version — see the key-rotation comment above.
 * Uses AES-256-GCM — authenticated encryption, tamper-evident.
 *
 * Exported as encryptSecret/decryptSecret below for reuse by anything that
 * needs this exact key-rotation-aware AES-256-GCM scheme outside the
 * credentialsRefs/credentialVault tables themselves (e.g. whopWebhookRegistry's
 * per-subscription signing secret) — one crypto implementation for every
 * secret this app stores, not a second one reinvented per table.
 */
function encrypt(plaintext: string): { encryptedValue: string; iv: string; keyVersion: number } {
  const key = getKeyForVersion(CURRENT_KEY_VERSION);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store authTag appended to encrypted payload
  return {
    encryptedValue: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("hex"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/**
 * Decrypts a stored credential value using the key that was active when it
 * was encrypted, not necessarily the current one.
 */
function decrypt(encryptedValue: string, iv: string, keyVersion: number): string {
  const key = getKeyForVersion(keyVersion);
  const buf = Buffer.from(encryptedValue, "base64");
  // Last 16 bytes are the auth tag
  const authTag = buf.subarray(buf.length - 16);
  const encrypted = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function encryptSecret(plaintext: string): { encryptedValue: string; iv: string; keyVersion: number } {
  return encrypt(plaintext);
}

export function decryptSecret(encryptedValue: string, iv: string, keyVersion: number): string {
  return decrypt(encryptedValue, iv, keyVersion);
}

/**
 * Stores or updates a credential in the database.
 * Call this during Pin-Down onboarding when the buyer submits their API keys.
 *
 * If this engagement/provider was previously linked to a shared vault
 * credential (see storeVaultCredential/linkEngagementToVault below),
 * typing a fresh value here de-links it — vaultId is cleared and this
 * row goes back to storing its own independent encrypted value, exactly
 * as it always did before the vault existed. This is deliberate: pasting
 * a new key is "use my own value from here," not a silent overwrite of a
 * credential other engagements are still sharing.
 */
export async function storeCredential(
  engagementId: string,
  provider: string,
  refKey: string,
  plainValue: string,
  dbClient: DbClient = db
): Promise<void> {
  const { encryptedValue, iv, keyVersion } = encrypt(plainValue);

  const existing = await dbClient
    .select()
    .from(credentialsRefs)
    .where(
      and(
        eq(credentialsRefs.engagementId, engagementId),
        eq(credentialsRefs.provider, provider)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Re-saving an existing credential always moves it onto the current
    // key version, even if it was previously encrypted with an older one —
    // this is how rows gradually migrate off a retired key without a
    // separate bulk-migration job.
    await dbClient
      .update(credentialsRefs)
      .set({ encryptedValue, iv, keyVersion, refKey, vaultId: null, updatedAt: new Date() })
      .where(eq(credentialsRefs.id, existing[0].id));
  } else {
    await dbClient.insert(credentialsRefs).values({
      id: crypto.randomUUID(),
      engagementId,
      provider,
      refKey,
      encryptedValue,
      iv,
      keyVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

/**
 * Links an engagement/provider to a shared vault credential instead of
 * storing its own value — the "reuse a saved credential" action. Any
 * previously-stored local value for this engagement/provider is
 * discarded (encryptedValue/iv cleared) since it's no longer the source
 * of truth; resolveCredential will read from the vault row from here on.
 *
 * Does NOT verify the vault row belongs to the caller's whopUserId —
 * callers (the API route) must check that themselves before calling
 * this, the same way every other credentials.ts function trusts its
 * caller to have already checked the engagement belongs to the right
 * tenant.
 */
export async function linkEngagementToVault(
  engagementId: string,
  provider: string,
  vaultId: string,
  dbClient: DbClient = db
): Promise<void> {
  const existing = await dbClient
    .select({ id: credentialsRefs.id })
    .from(credentialsRefs)
    .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)))
    .limit(1);

  if (existing.length > 0) {
    await dbClient
      .update(credentialsRefs)
      .set({ vaultId, encryptedValue: null, iv: null, updatedAt: new Date() })
      .where(eq(credentialsRefs.id, existing[0].id));
  } else {
    // refKey has always been a human-audit label, never used to look
    // anything up — safe to synthesize one here rather than requiring
    // the caller to invent a refKey for a row that has no local secret.
    await dbClient.insert(credentialsRefs).values({
      id: crypto.randomUUID(),
      engagementId,
      provider,
      refKey: `vault://${vaultId}`,
      encryptedValue: null,
      iv: null,
      vaultId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

/**
 * Saves a new reusable credential to the operator's vault. Call this from
 * the "save this so I can reuse it for other clients" checkbox — separate
 * from storeCredential, which writes an engagement-local value.
 *
 * Scoped to workspaceId — reuse only offers credentials saved in the
 * *current* workspace, never pooled across every workspace a whopUserId
 * happens to own. whopUserId is still recorded (audit trail only).
 */
export async function storeVaultCredential(
  workspaceId: string,
  whopUserId: string,
  provider: string,
  label: string,
  refKey: string,
  plainValue: string
): Promise<string> {
  const { encryptedValue, iv, keyVersion } = encrypt(plainValue);
  const id = crypto.randomUUID();
  await db.insert(credentialVault).values({
    id,
    whopUserId,
    workspaceId,
    provider,
    label,
    refKey,
    encryptedValue,
    iv,
    keyVersion,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

/** Rotates the value and/or renames a vault credential. Every engagement linked via vaultId picks up the new value on its next resolveCredential() call — no re-linking needed. */
export async function rotateVaultCredential(
  vaultId: string,
  updates: { plainValue?: string; label?: string }
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.plainValue !== undefined) {
    const { encryptedValue, iv, keyVersion } = encrypt(updates.plainValue);
    Object.assign(set, { encryptedValue, iv, keyVersion });
  }
  if (updates.label !== undefined) {
    set.label = updates.label;
  }
  await db.update(credentialVault).set(set).where(eq(credentialVault.id, vaultId));
}

/**
 * rotateVaultCredential's Composio-managed equivalent — reconnects an
 * EXISTING shared vault row to a fresh connected account, instead of
 * storeComposioVaultCredential's always-insert-a-new-row behavior. This is
 * the fix for a real gap: rotateVaultCredential only accepts a plaintext
 * value, so a Composio-managed row (whose "value" is a composio:<id>
 * pointer, not a rotatable secret) had no rotate path at all — confirmed
 * by apps-page-client.tsx's VaultRow explicitly hiding its Rotate button
 * for isComposioManaged rows. That meant once a shared Composio credential
 * went invalid (the buyer revoked app access, the underlying token expired
 * past refresh), there was no way to fix it for the engagements already
 * linked to it: deleteVaultCredential refuses to delete a row still in
 * use, and reconnecting via a *different* CredentialRow just creates an
 * unrelated new vault row that only that one engagement gets linked to —
 * every other client sharing the original row stayed silently broken.
 *
 * Deliberately does NOT touch encryptedValue/iv/keyVersion — those hold
 * only the harmless Composio placeholder (see storeComposioVaultCredential)
 * and are never read back for a composio:-refKey row (resolveCredential's
 * composio: branch bypasses decrypt() entirely). Resets healthStatus back
 * to "unknown" so the next daily check (or a manual Test connection)
 * re-establishes it as ok, rather than leaving the old "invalid" verdict
 * sitting stale against a token that's actually fresh again.
 *
 * Also revokes the OLD connection at Composio before overwriting refKey —
 * same reasoning and same swallow-errors-never-block pattern as
 * deleteVaultCredential's own revoke-then-delete below: a reconnect
 * replaces which connection this row points at, so the one it's replacing
 * should stop being valid too, not linger as a forgotten-but-still-active
 * grant at Composio (and, through it, at the underlying platform). If the
 * row's current refKey isn't Composio-managed (shouldn't happen — the
 * callback route only calls this after confirming the row's provider
 * matches, and every Composio-managed row's refKey is always a
 * composio:<id> pointer) connectedAccountIdFromRefKey simply returns null
 * and this is a no-op, same as an already-broken/never-connected row.
 */
export async function rotateComposioVaultCredential(vaultId: string, connectedAccountId: string): Promise<void> {
  const [row] = await db.select({ refKey: credentialVault.refKey }).from(credentialVault).where(eq(credentialVault.id, vaultId)).limit(1);
  const oldConnectedAccountId = row ? connectedAccountIdFromRefKey(row.refKey) : null;

  // Ordering fix (found by this session's own adversarial review): the DB
  // write now happens BEFORE the old-connection revoke, not after. If the
  // DB write throws (network blip, DB error), the old connection is still
  // untouched and valid — nothing is broken. The old ordering could revoke
  // the old connection successfully and then have the DB write throw,
  // leaving the vault row pointing at a connection that no longer exists,
  // silently broken for every engagement sharing it until the next daily
  // health check surfaces it. This ordering fails safe instead: worst case
  // on a revoke failure (already caught below, non-fatal) is a lingering
  // un-revoked old connection at Composio, not a broken credential.
  await db
    .update(credentialVault)
    .set({
      refKey: composioVaultRefKey(connectedAccountId),
      healthStatus: "unknown",
      lastCheckedAt: null,
      lastCheckError: null,
      updatedAt: new Date(),
    })
    .where(eq(credentialVault.id, vaultId));

  if (oldConnectedAccountId && oldConnectedAccountId !== connectedAccountId) {
    try {
      await deleteComposioConnection(oldConnectedAccountId);
    } catch (err) {
      console.error(`[credential-vault] Failed to revoke old Composio connection ${oldConnectedAccountId} while reconnecting vault row ${vaultId}:`, err);
    }
  }
}

/**
 * Saves a Composio-managed connection into the vault. Distinct from
 * storeVaultCredential: refKey is a "composio:<connectedAccountId>"
 * pointer, not a rotatable encrypted secret — the placeholder plaintext
 * satisfies the encryptedValue/iv NOT NULL columns but is never read back
 * (resolveCredential's composio: branch bypasses decrypt() entirely).
 * Rotating a Composio-managed row doesn't make sense the same way a
 * pasted key does — Composio refreshes the underlying token itself;
 * "reconnect" (a fresh startComposioConnect call, then delete the old
 * row) is the equivalent action, not rotateVaultCredential.
 */
export async function storeComposioVaultCredential(
  workspaceId: string,
  whopUserId: string,
  provider: string,
  label: string,
  refKey: string
): Promise<string> {
  return storeVaultCredential(workspaceId, whopUserId, provider, label, refKey, "managed-via-composio");
}

/**
 * Resolves a credential for runtime use.
 * Looks up by engagementId + provider, decrypts, returns plaintext value.
 * Throws clearly if the credential hasn't been set up.
 *
 * Transparently follows vaultId when this engagement/provider is linked
 * to a shared vault credential rather than storing its own value — every
 * other caller in the codebase (all the platform clients in
 * src/lib/platforms/*.ts) stays completely unaware a vault exists at all.
 */
export async function resolveCredential(
  engagementId: string,
  provider: string
): Promise<string> {
  const rows = await db
    .select()
    .from(credentialsRefs)
    .where(
      and(
        eq(credentialsRefs.engagementId, engagementId),
        eq(credentialsRefs.provider, provider)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `No credential found for engagement [${engagementId}] provider [${provider}]. ` +
      "Buyer needs to complete Pin-Down setup and connect this platform."
    );
  }

  const row = rows[0];

  if (row.vaultId) {
    const vaultRows = await db
      .select()
      .from(credentialVault)
      .where(eq(credentialVault.id, row.vaultId))
      .limit(1);
    if (vaultRows.length === 0) {
      // Shouldn't happen (deleteVaultCredential refuses to delete an
      // in-use row), but if it ever does, fail with a message that points
      // straight at the fix instead of a generic "vault row is null" crash.
      throw new Error(
        `Engagement [${engagementId}] provider [${provider}] is linked to a vault credential that no longer exists. ` +
        "Re-link it to a saved credential, or enter a new value directly."
      );
    }
    const v = vaultRows[0];

    // Composio-managed connection: the vault row's encryptedValue is a
    // harmless placeholder (see storeComposioVaultCredential in
    // composio.ts) — the real credential lives at Composio and is
    // fetched live on every resolve, never cached locally. Every caller
    // of resolveCredential() stays unaware this branch exists at all,
    // same as it's unaware of the vault itself.
    const connectedAccountId = connectedAccountIdFromRefKey(v.refKey);
    if (connectedAccountId) {
      return getComposioCredentialValue(connectedAccountId);
    }

    return decrypt(v.encryptedValue, v.iv, v.keyVersion);
  }

  if (!row.encryptedValue || !row.iv) {
    throw new Error(
      `Credential row for engagement [${engagementId}] provider [${provider}] has neither a local value nor a vault link. ` +
      "This shouldn't be reachable — storeCredential and linkEngagementToVault both always set one or the other."
    );
  }

  return decrypt(row.encryptedValue, row.iv, row.keyVersion);
}

/**
 * Resolves a saved vault credential's plaintext value for a live,
 * client-triggered lookup during onboarding — the "new engagement" wizard
 * only ever has a vaultId in reuse mode, never the plaintext (that's the
 * point of the vault), so the wizard's calendar/list/workflow lookup
 * routes (src/app/api/integrations/*) need a way to get a usable value
 * themselves instead of requiring the buyer to re-paste a key that's
 * already saved. Mirrors resolveCredential's vault branch exactly —
 * Composio-managed rows resolve live via getComposioCredentialValue,
 * everything else decrypts locally — so the two never drift apart.
 *
 * Always verify vaultCredentialBelongsToTenant(vaultId, workspaceId)
 * before calling this; it does not re-check ownership itself, matching
 * every other function in this file that trusts its caller to have
 * already scoped the request to the right workspace.
 */
export async function resolveVaultCredentialValue(vaultId: string): Promise<string> {
  const rows = await db.select().from(credentialVault).where(eq(credentialVault.id, vaultId)).limit(1);
  if (rows.length === 0) {
    throw new Error("Saved credential not found.");
  }
  const v = rows[0];

  const connectedAccountId = connectedAccountIdFromRefKey(v.refKey);
  if (connectedAccountId) {
    return getComposioCredentialValue(connectedAccountId);
  }

  if (!v.encryptedValue || !v.iv) {
    throw new Error("Saved credential has no usable value.");
  }
  return decrypt(v.encryptedValue, v.iv, v.keyVersion);
}

/**
 * Checks whether a credential exists without throwing.
 * Use this for conditional platform support checks.
 */
export async function hasCredential(
  engagementId: string,
  provider: string
): Promise<boolean> {
  const rows = await db
    .select({ id: credentialsRefs.id })
    .from(credentialsRefs)
    .where(
      and(
        eq(credentialsRefs.engagementId, engagementId),
        eq(credentialsRefs.provider, provider)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * For the "reuse a saved credential" picker — never returns decrypted
 * values, just enough to render a labeled option list. Scoped to
 * workspaceId, not whopUserId: an account with multiple workspaces only
 * sees the current workspace's saved credentials, never another
 * workspace's.
 */
export async function listVaultCredentials(
  workspaceId: string,
  provider?: string
): Promise<Array<{ id: string; provider: string; label: string; healthStatus: string; createdAt: Date; isComposioManaged: boolean }>> {
  const rows = await db
    .select({
      id: credentialVault.id,
      provider: credentialVault.provider,
      label: credentialVault.label,
      healthStatus: credentialVault.healthStatus,
      createdAt: credentialVault.createdAt,
      refKey: credentialVault.refKey,
    })
    .from(credentialVault)
    .where(
      provider
        ? and(eq(credentialVault.workspaceId, workspaceId), eq(credentialVault.provider, provider))
        : eq(credentialVault.workspaceId, workspaceId)
    );
  return rows.map(({ refKey, ...rest }) => ({ ...rest, isComposioManaged: connectedAccountIdFromRefKey(refKey) !== null }));
}

/**
 * Confirms a vault row belongs to the given workspace before any mutating
 * call touches it — every vault API route checks this first. Scoped to
 * workspaceId (not whopUserId) for the same cross-workspace-leak reason
 * as listVaultCredentials above.
 */
export async function vaultCredentialBelongsToTenant(vaultId: string, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: credentialVault.id })
    .from(credentialVault)
    .where(and(eq(credentialVault.id, vaultId), eq(credentialVault.workspaceId, workspaceId)))
    .limit(1);
  return rows.length > 0;
}

/** Which engagements currently resolve this vault credential — used both to block deletion while in use and to show "used by 3 clients" in the picker. */
export async function listEngagementsUsingVaultCredential(vaultId: string): Promise<string[]> {
  const rows = await db
    .select({ engagementId: credentialsRefs.engagementId })
    .from(credentialsRefs)
    .where(eq(credentialsRefs.vaultId, vaultId));
  return rows.map((r) => r.engagementId);
}

/**
 * De-links an engagement/provider from the vault without supplying a
 * replacement value — leaves it in the same "not configured" state a
 * brand new engagement is in. Distinct from storeCredential's implicit
 * de-link, which always pairs de-linking with a fresh value in the same
 * call; this is for "stop using the shared one and I'll decide what's
 * next" with no value in hand yet.
 */
export async function unlinkEngagementFromVault(engagementId: string, provider: string): Promise<void> {
  await db
    .delete(credentialsRefs)
    .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)));
}

// Which of engagements.stack's platform-choice fields have their own
// "<platform>_credentials_ref" marker, keyed by the platform field whose
// value selects the provider. Kept as a plain lookup, not a StackField
// union like chat-credentials.ts's smaller booking/email-only one, since
// every caller here already knows the provider string but NOT which
// platform slot it fills — see syncStackCredentialMarkers below.
const STACK_CREDENTIAL_MARKERS: ReadonlyArray<{
  platform: keyof EngagementStack;
  ref: keyof EngagementStack;
}> = [
  { platform: "booking_platform", ref: "booking_platform_credentials_ref" },
  { platform: "email_platform", ref: "email_platform_credentials_ref" },
  { platform: "hosting_platform", ref: "hosting_platform_credentials_ref" },
  { platform: "sms_platform", ref: "sms_platform_credentials_ref" },
  { platform: "ad_data_platform", ref: "ad_data_platform_credentials_ref" },
  { platform: "conversation_intelligence_provider", ref: "conversation_intelligence_credentials_ref" },
  { platform: "video_engagement_platform", ref: "video_engagement_credentials_ref" },
];

/**
 * Fixes a real bug found by this session's own Showtime audit: storeCredential/
 * linkEngagementToVault/unlinkEngagementFromVault above only ever touch the
 * credentialsRefs table — but worker-config-completeness.ts's checkers and
 * worker-capability-status.ts's readers gate booking/email/hosting/sms/
 * ad-data/recall/video credentials on a separate boolean marker string on
 * engagements.stack (e.g. stack.booking_platform_credentials_ref), which
 * was previously only ever written once, during the new-engagement wizard
 * (submit-payload.ts) or chat's own booking/email-only linkReusableCredential.
 * The one general-purpose post-creation UI for this (CredentialRow in
 * update-credentials-form.tsx, reachable from every engagement's own page)
 * called storeCredential/linkEngagementToVault and never touched this
 * marker at all — so any client whose credential wasn't captured at
 * creation time (platform left unset, or changed later) could connect a
 * real, working key through this UI, get a success toast, and stay
 * permanently blocked by the completeness gate regardless, since nothing
 * ever flipped the marker it actually checks.
 *
 * Call this right after storeCredential/linkEngagementToVault (linked=true)
 * or unlinkEngagementFromVault (linked=false) for the same engagementId/
 * provider. Cross-references the CURRENT stack's own platform-choice
 * fields (booking_platform, email_platform, …) against `provider` — not a
 * caller-supplied field name — since none of the routes calling this know
 * which slot a given provider string fills; the engagement's stack is the
 * only place that mapping actually lives. Updates every matching slot (in
 * the rare case one provider is picked for more than one role, e.g. the
 * same ESP used for both email and ad-data), and silently no-ops for a
 * provider that isn't currently selected in any slot (recall_ai's own
 * provider string just happens to equal its field's value, apollo/pdl have
 * no stack marker at all — hasCredential checks credentialsRefs directly
 * for those two, so they're correctly untouched here).
 */
export async function syncStackCredentialMarkers(
  engagementId: string,
  provider: string,
  linked: boolean,
  dbClient: DbClient = db
): Promise<void> {
  const [row] = await dbClient.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row?.stack) return;
  const stack = row.stack as Partial<EngagementStack>;

  const patch: Partial<Record<keyof EngagementStack, string | undefined>> = {};
  let changed = false;
  for (const { platform, ref } of STACK_CREDENTIAL_MARKERS) {
    if (stack[platform] !== provider) continue;
    const nextValue = linked ? `secrets://${engagementId}/${provider}_key` : undefined;
    if (stack[ref] !== nextValue) {
      patch[ref] = nextValue;
      changed = true;
    }
  }
  if (!changed) return;

  const mergedStack = { ...stack, ...patch };
  await dbClient
    .update(engagements)
    .set({ stack: mergedStack as EngagementStack, updatedAt: new Date() })
    .where(eq(engagements.engagementId, engagementId));
}

/**
 * Deletes a vault credential — refuses if any engagement is still linked
 * to it, since that would silently break their next run rather than fail
 * loudly at delete time. For a Composio-managed row, also revokes the
 * connection at Composio (and therefore at the underlying platform)
 * before removing the local pointer — this is the actual "revoke access"
 * action, not just forgetting our own reference to it. The upstream
 * revoke failing doesn't block the local delete: if Composio's API is
 * briefly unavailable, the person clicking Delete should still be able to
 * remove the credential locally rather than getting stuck, and a
 * Composio-side connection with no local pointer left anywhere is inert
 * (nothing in this app can resolve to it again).
 */
export async function deleteVaultCredential(vaultId: string): Promise<{ ok: true } | { ok: false; usedBy: string[] }> {
  const usedBy = await listEngagementsUsingVaultCredential(vaultId);
  if (usedBy.length > 0) {
    return { ok: false, usedBy };
  }

  const [row] = await db.select({ refKey: credentialVault.refKey }).from(credentialVault).where(eq(credentialVault.id, vaultId)).limit(1);
  const connectedAccountId = row ? connectedAccountIdFromRefKey(row.refKey) : null;
  if (connectedAccountId) {
    try {
      await deleteComposioConnection(connectedAccountId);
    } catch (err) {
      console.error(`[credential-vault] Failed to revoke Composio connection ${connectedAccountId} before deleting vault row ${vaultId}:`, err);
    }
  }

  await db.delete(credentialVault).where(eq(credentialVault.id, vaultId));
  return { ok: true };
}