import crypto from "crypto";

// Whop's OAuth 2.1 + PKCE endpoints all live under https://api.whop.com/oauth/
// (docs.whop.com/developer/guides/oauth). The previous version of this file
// pointed at https://whop.com/oauth for authorize and a nonexistent
// /v5/oauth/token + /v5/me pair for token exchange and userinfo — none of
// those are real Whop endpoints, so login/callback could never have worked
// against the live API even with real credentials.
const WHOP_OAUTH_BASE = "https://api.whop.com/oauth";

const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID!;
const WHOP_REDIRECT_URI = process.env.WHOP_REDIRECT_URI!;

export type WhopTokens = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
};

// Whop's userinfo response is OIDC-shaped: the stable user identifier is
// `sub` (e.g. "user_xxxxx"), not `id`. `email`/`name` are only present if
// the corresponding scopes were requested and granted.
export type WhopUserInfo = {
  sub: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
};

export function generateAuthUrl(
  state: string,
  codeVerifier: string,
  nonce: string
) {
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: WHOP_CLIENT_ID,
    redirect_uri: WHOP_REDIRECT_URI,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${WHOP_OAUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<WhopTokens> {
  const res = await fetch(`${WHOP_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: WHOP_REDIRECT_URI,
      client_id: WHOP_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Whop token exchange failed: ${err.error_description ?? res.status}`
    );
  }
  return res.json();
}

export async function refreshTokens(
  refreshToken: string
): Promise<WhopTokens> {
  const res = await fetch(`${WHOP_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: WHOP_CLIENT_ID,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Whop token refresh failed: ${err.error_description ?? res.status}`
    );
  }
  return res.json();
}

export async function getWhopUser(
  accessToken: string
): Promise<WhopUserInfo> {
  const res = await fetch(`${WHOP_OAUTH_BASE}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Whop user: ${res.status}`);
  return res.json();
}

// Revokes a refresh token server-side so it can't be replayed if it ever
// leaks. Access tokens themselves expire after 1 hour and can't be
// server-revoked — only the refresh token can. Call this on logout.
export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(`${WHOP_OAUTH_BASE}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: refreshToken,
      client_id: WHOP_CLIENT_ID,
    }),
  }).catch((err) => {
    // Don't block logout on a revoke failure (network blip, already-expired
    // token, etc.) — the session cookie is destroyed regardless below.
    console.error("[whop] token revoke failed:", err);
  });
}