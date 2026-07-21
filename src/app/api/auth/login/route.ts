// src/app/api/auth/login/route.ts
import { redirect } from "next/navigation";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";
import { encryptOAuthState } from "@/lib/oauth-state";

export async function GET(request: Request) {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");

  const rawRedirectTo = new URL(request.url).searchParams.get("redirect_to");
  const safeRedirectTo =
    rawRedirectTo && rawRedirectTo.startsWith("/") && !rawRedirectTo.startsWith("//")
      ? rawRedirectTo
      : undefined;

  // 🔑 THE FIX: Encrypt code_verifier INTO the state parameter.
  // This survives the cross-site round-trip to Whop and back,
  // unlike cookies which get blocked in iframe contexts.
  const state = encryptOAuthState(
    { codeVerifier, redirectTo: safeRedirectTo },
    process.env.SESSION_SECRET!
  );

  redirect(generateAuthUrl(state, codeVerifier, nonce));
}