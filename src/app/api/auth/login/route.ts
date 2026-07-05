import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

/**
 * Live Whop OAuth 2.1 + PKCE Authentication Entrypoint
 * Replaces the sandbox testing layer for production user gating.
 */
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