import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

export async function GET(request: Request) {
  const state = crypto.randomBytes(16).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    ...(isProd ? { partitioned: true } : {}),
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };
  
  cookieStore.set("oauth_state", state, cookieOpts);
  cookieStore.set("oauth_nonce", nonce, cookieOpts);
  cookieStore.set("code_verifier", codeVerifier, cookieOpts);

  const redirectTo = new URL(request.url).searchParams.get("redirect_to");
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    cookieStore.set("post_login_redirect", redirectTo, cookieOpts);
  }

  redirect(generateAuthUrl(state, codeVerifier, nonce));
}