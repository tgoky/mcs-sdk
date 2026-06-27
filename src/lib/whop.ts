import crypto from "crypto";

const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID!;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET!;
const WHOP_REDIRECT_URI = process.env.WHOP_REDIRECT_URI!;

export function generateAuthUrl(state: string, codeVerifier: string) {
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: WHOP_CLIENT_ID,
    redirect_uri: WHOP_REDIRECT_URI,
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://whop.com/oauth?${params.toString()}`;
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const res = await fetch("https://api.whop.com/v5/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: WHOP_CLIENT_ID,
      client_secret: WHOP_CLIENT_SECRET,
      code,
      redirect_uri: WHOP_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json();
}

export async function getWhopUser(accessToken: string) {
  const res = await fetch("https://api.whop.com/v5/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Whop user");
  return res.json();
}