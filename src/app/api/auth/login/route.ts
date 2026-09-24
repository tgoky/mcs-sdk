// src/app/api/auth/login/route.ts
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";
import { encryptOAuthState, OAUTH_NONCE_COOKIE, OAUTH_STATE_MAX_AGE_MS } from "@/lib/oauth-state";
import { buildOAuthRedirectHtml, safeRelativePath } from "@/lib/oauth-redirect-html";

export async function GET(request: Request) {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  // Separate from the OpenID nonce above, which travels in the URL.
  const browserBinding = crypto.randomBytes(32).toString("base64url");

  const rawRedirectTo = new URL(request.url).searchParams.get("redirect_to");
  const safeRedirectTo = safeRelativePath(rawRedirectTo);

  // 🔑 THE FIX: Encrypt code_verifier INTO the state parameter.
  // This survives the cross-site round-trip to Whop and back,
  // unlike cookies which get blocked in iframe contexts.
  const state = encryptOAuthState(
    { codeVerifier, redirectTo: safeRedirectTo, nonce: browserBinding, issuedAt: Date.now() },
    process.env.SESSION_SECRET!
  );

  const destination = generateAuthUrl(state, codeVerifier, nonce);

  return new Response(buildOAuthRedirectHtml(destination, "Redirecting to Whop..."), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Ties the login to this browser; the callback checks it against the
      // state. Lax is enough: Whop's redirect back is a top-level navigation.
      "Set-Cookie": `${OAUTH_NONCE_COOKIE}=${browserBinding}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE_MS / 1000}`,
    },
  });
}