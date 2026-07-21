// src/app/api/auth/callback/whop/route.ts
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { decryptOAuthState } from "@/lib/oauth-state";

function buildRedirectHtml(destination: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${destination}" />
  </head>
  <body style="background:#1f1a2e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Authenticated — redirecting...</p>
    <script>
      // Navigates inside Whop iframe context
      window.location.href = ${JSON.stringify(destination)};
    </script>
  </body>
</html>`;
}

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

    // 1. Decrypt state parameter
    const stateData = decryptOAuthState(rawState, process.env.SESSION_SECRET!);

    if (!stateData?.codeVerifier) {
      console.error("[whop-callback] Failed to decrypt OAuth state");
      return new Response(
        "Invalid or expired OAuth state. Please try logging in again.",
        { status: 400 }
      );
    }

    const { codeVerifier, redirectTo } = stateData;

    // 2. Exchange code for tokens
    const tokens = await exchangeCode(code, codeVerifier);

    // 3. Fetch Whop user profile
    const whopUser = await getWhopUser(tokens.access_token);
    const whopUserId = whopUser.sub;

    // 4. Validate membership
    const admin = isAdminEmail(whopUser.email);
    const membership = admin
      ? { hasAccess: true, status: "admin" as const }
      : await checkActiveMembership(whopUserId);

    // 5. Upsert user record
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

    // 6. 3-arg getIronSession writing into sessionResponse
    const sessionResponse = new Response(null, { status: 200 });

    const session = await getIronSession<SessionData>(
      request,
      sessionResponse,
      sessionOptions // Imported from @/lib/session
    );

    session.whopUserId = whopUserId;
    session.email = whopUser.email ?? "";
    session.subscriptionStatus = membership.status;
    session.subscriptionVerifiedAt = Date.now();
    session.refreshToken = tokens.refresh_token;

    await session.save();

    // 7. Extract Set-Cookie header
    const setCookieHeader = sessionResponse.headers.get("Set-Cookie");

    if (!setCookieHeader) {
      console.error("[whop-callback] CRITICAL: Set-Cookie header missing from sessionResponse");
      return new Response("Session creation failed — cookie not set", { status: 500 });
    }

    const destination = membership.hasAccess
      ? redirectTo || "/home"
      : "/?membership=required";

    // 8. Return 200 HTML with Set-Cookie attached
    return new Response(buildRedirectHtml(destination), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": setCookieHeader,
      },
    });
  } catch (err: any) {
    console.error("[whop-callback] Fatal:", err);
    return new Response(`Auth error: ${err.message}`, { status: 500 });
  }
}