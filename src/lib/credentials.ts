import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { credentialsRefs } from "@/models/schema";
import { and, eq } from "drizzle-orm";

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY!;
// Must be exactly 32 bytes (256-bit) hex string set in env

/**
 * Encrypts a credential value for storage.
 * Uses AES-256-GCM — authenticated encryption, tamper-evident.
 */
function encrypt(plaintext: string): { encryptedValue: string; iv: string } {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
      "Generate with: openssl rand -hex 32"
    );
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store authTag appended to encrypted payload
  return {
    encryptedValue: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypts a stored credential value.
 */
function decrypt(encryptedValue: string, iv: string): string {
  const buf = Buffer.from(encryptedValue, "base64");
  // Last 16 bytes are the auth tag
  const authTag = buf.subarray(buf.length - 16);
  const encrypted = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    Buffer.from(iv, "hex")
  );
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
  plainValue: string
): Promise<void> {
  const { encryptedValue, iv } = encrypt(plainValue);

  const existing = await db
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
    await db
      .update(credentialsRefs)
      .set({ encryptedValue, iv, refKey, updatedAt: new Date() })
      .where(eq(credentialsRefs.id, existing[0].id));
  } else {
    await db.insert(credentialsRefs).values({
      id: crypto.randomUUID(),
      engagementId,
      provider,
      refKey,
      encryptedValue,
      iv,
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

  return decrypt(rows[0].encryptedValue, rows[0].iv);
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