// src/app/api/auth/login/route.ts
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";
import { encryptOAuthState, OAUTH_NONCE_COOKIE, OAUTH_STATE_MAX_AGE_MS } from "@/lib/oauth-state";
import { buildOAuthRedirectHtml, safeRelativePath } from "@/lib/oauth-redirect-html";
import { clientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limited = await rateLimitResponse(RATE_LIMITS.authLogin, clientIp(request), "Too many sign-in attempts. Wait a minute and try again.");
  if (limited) return limited;
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  // Separate from the OpenID nonce above, which travels in the URL.
  const browserBinding = crypto.randomBytes(32).toString("base64url");

  const searchParams = new URL(request.url).searchParams;
  const safeRedirectTo = safeRelativePath(searchParams.get("redirect_to"));
  // Set by the checkout widget and /checkout/complete once a payment goes through.
  const afterCheckout = searchParams.get("after_checkout") === "1";
  // Set by "Sign in with that account" on /checkout (via logout).
  const switchAccount = searchParams.get("switch_account") === "1";

  // 🔑 THE FIX: Encrypt code_verifier INTO the state parameter.
  // This survives the cross-site round-trip to Whop and back,
  // unlike cookies which get blocked in iframe contexts.
  const state = encryptOAuthState(
    { codeVerifier, redirectTo: safeRedirectTo, nonce: browserBinding, issuedAt: Date.now(), afterCheckout },
    process.env.SESSION_SECRET!
  );

  const destination = generateAuthUrl(state, codeVerifier, nonce, { forceLogin: switchAccount });

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