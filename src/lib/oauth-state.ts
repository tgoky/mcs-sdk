// src/lib/oauth-state.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export interface OAuthStateData {
  codeVerifier: string;
  redirectTo?: string;
  /** Also set as a cookie on the browser that started the login; the
   * callback requires both to match, so a login started elsewhere can't
   * be finished in this browser (login CSRF). */
  nonce?: string;
  /** When the login started (ms). States older than OAUTH_STATE_MAX_AGE_MS are refused. */
  issuedAt?: number;
}

export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const OAUTH_NONCE_COOKIE = "mudd_oauth_nonce";

export function encryptOAuthState(
  data: OAuthStateData,
  secret: string
): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext → base64url
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64url");
}

export function decryptOAuthState(
  encrypted: string,
  secret: string
): OAuthStateData | null {
  try {
    const key = deriveKey(secret);
    const combined = Buffer.from(encrypted, "base64url");

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}