// src/app/api/auth/callback/whop/route.ts
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { getSession } from "@/lib/session";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { decryptOAuthState } from "@/lib/oauth-state";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const rawState = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return new Response(`Whop OAuth error: ${error}`, { status: 400 });
    }

    if (!code || !rawState) {
      return new Response("Missing code or state parameter", { status: 400 });
    }

    // 🔑 Decrypt state to recover code_verifier and redirect destination
    const stateData = decryptOAuthState(rawState, process.env.SESSION_SECRET!);

    if (!stateData?.codeVerifier) {
      console.error("[whop-callback] Failed to decrypt OAuth state");
      return new Response(
        "Invalid or expired OAuth state. Please try logging in again.",
        { status: 400 }
      );
    }

    const { codeVerifier, redirectTo } = stateData;

    // 1. Exchange code for tokens
    const tokens = await exchangeCode(code, codeVerifier);

    // 2. Fetch Whop user profile
    const whopUser = await getWhopUser(tokens.access_token);
    const whopUserId = whopUser.sub;

    // 3. Validate membership
    const admin = isAdminEmail(whopUser.email);
    const membership = admin
      ? { hasAccess: true, status: "admin" as const }
      : await checkActiveMembership(whopUserId);

    // 4. Upsert user record
    await db
      .insert(users)
      .values({
        whopUserId,
        email: whopUser.email,
        subscriptionStatus: membership.status,
      })
      .onConflictDoUpdate({
        target: users.whopUserId,
        set: {
          email: whopUser.email,
          subscriptionStatus: membership.status,
          updatedAt: new Date(),
        },
      });

    // 5. Create iron-session
    const session = await getSession();
    session.whopUserId = whopUserId;
    session.email = whopUser.email ?? "";
    session.subscriptionStatus = membership.status;
    session.subscriptionVerifiedAt = Date.now();
    session.refreshToken = tokens.refresh_token;
    await session.save();

    // 6. Determine destination
    const destination = membership.hasAccess
      ? redirectTo || "/home"
      : "/?membership=required";

    // 🌟 THE IFRAME FIX: Return 200 HTML instead of 302 redirect.
    // Browsers drop Set-Cookie headers on 302 cross-site redirects inside iframes.
    // A 200 response forces the browser to store the cookie BEFORE navigating.
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${destination}" />
  </head>
  <body style="background:#1f1a2e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Authenticated — redirecting...</p>
    <script>window.location.href = ${JSON.stringify(destination)};</script>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("[whop-callback] Fatal:", err);
    return new Response(`Auth error: ${err.message}`, { status: 500 });
  }
}