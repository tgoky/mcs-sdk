import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, { httpOnly: true, maxAge: 600 });
  cookieStore.set("code_verifier", codeVerifier, {
    httpOnly: true,
    maxAge: 600,
  });

  redirect(generateAuthUrl(state, codeVerifier));
}