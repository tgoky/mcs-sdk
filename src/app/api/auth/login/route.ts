import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

/**
 * Live Whop OAuth 2.1 + PKCE Authentication Entrypoint
 * Replaces the sandbox testing layer for production user gating.
 */
export async function GET(request: Request) {
  const state = crypto.randomBytes(16).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  
  // 🌟 FIXED FOR WHOP IFRAME: sameSite "none" + secure true ensure
  // state/verifier cookies survive cross-site redirects inside the iframe
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes — only needs to survive the redirect round trip
  };
  
  cookieStore.set("oauth_state", state, cookieOpts);
  cookieStore.set("oauth_nonce", nonce, cookieOpts);
  cookieStore.set("code_verifier", codeVerifier, cookieOpts);

  // Where to send the user once login completes. Set by middleware.ts
  // whenever it bounces an unauthenticated request through here — without
  // this, the callback has no memory of what the user was actually trying
  // to reach and always falls back to the dashboard root.
  const redirectTo = new URL(request.url).searchParams.get("redirect_to");
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    // Requires a leading "/" (path-relative) AND rejects a leading "//"
    // specifically — "//evil.com" also passes a naive startsWith("/")
    // check but browsers treat it as protocol-relative to evil.com, not
    // as a same-origin path. Only single-leading-slash, same-origin
    // destinations are ever honored here.
    cookieStore.set("post_login_redirect", redirectTo, cookieOpts);
  }

  redirect(generateAuthUrl(state, codeVerifier, nonce));
}