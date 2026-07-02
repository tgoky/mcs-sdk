// src/app/api/auth/login/route.ts
//
// This used to skip Whop entirely: it injected a fake session
// (whopUserId: "dev_sandbox_user", subscriptionStatus: "active") directly
// and redirected to /dashboard. That meant nobody ever actually went
// through Whop OAuth — every visitor was silently treated as a paid,
// logged-in user. This is the real PKCE authorize redirect.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

export async function GET() {
  const state = crypto.randomBytes(16).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes — only needs to survive the redirect round trip
  };
  cookieStore.set("oauth_state", state, cookieOpts);
  cookieStore.set("oauth_nonce", nonce, cookieOpts);
  cookieStore.set("code_verifier", codeVerifier, cookieOpts);

  redirect(generateAuthUrl(state, codeVerifier, nonce));
}