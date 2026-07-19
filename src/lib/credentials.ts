import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { credentialsRefs } from "@/models/schema";
import { and, eq } from "drizzle-orm";

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

/**
 * Stores or updates a credential in the database.
 * Call this during Pin-Down onboarding when the buyer submits their API keys.
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
      .set({ encryptedValue, iv, keyVersion, refKey, updatedAt: new Date() })
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
 * Resolves a credential for runtime use.
 * Looks up by engagementId + provider, decrypts, returns plaintext value.
 * Throws clearly if the credential hasn't been set up.
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

  return decrypt(rows[0].encryptedValue, rows[0].iv, rows[0].keyVersion);
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