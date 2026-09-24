// src/app/api/auth/callback/whop/route.ts
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import crypto from "crypto";
import { decryptOAuthState, OAUTH_NONCE_COOKIE, OAUTH_STATE_MAX_AGE_MS } from "@/lib/oauth-state";
import { buildOAuthRedirectHtml, safeRelativePath } from "@/lib/oauth-redirect-html";

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const rawState = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return new NextResponse(`Whop OAuth error: ${error}`, { status: 400 });
    }

    if (!code || !rawState) {
      return new NextResponse("Missing code or state parameter", { status: 400 });
    }

    // Guard: Validate SESSION_SECRET length before running crypto
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
      console.error("[whop-callback] CRITICAL: SESSION_SECRET is missing or under 32 characters in Vercel env settings.");
      return new NextResponse(
        "Server configuration error: SESSION_SECRET must be set in environment variables and be at least 32 characters long.",
        { status: 500 }
      );
    }

    // 1. Decrypt OAuth state parameter
    const stateData = decryptOAuthState(rawState, secret);

    if (!stateData?.codeVerifier) {
      console.error("[whop-callback] Failed to decrypt OAuth state");
      return new NextResponse(
        "Invalid or expired OAuth state. Please try logging in again.",
        { status: 400 }
      );
    }

    // The login must have started in this browser, recently: the state's
    // nonce has to match the cookie the login route set here (otherwise an
    // attacker's own login could be finished in someone else's browser,
    // signing them in as the attacker).
    const cookieNonce = readCookie(request.headers.get("cookie"), OAUTH_NONCE_COOKIE);
    const fresh = typeof stateData.issuedAt === "number" && Date.now() - stateData.issuedAt < OAUTH_STATE_MAX_AGE_MS;
    if (!stateData.nonce || !cookieNonce || !fresh || !sameString(stateData.nonce, cookieNonce)) {
      // A page with a link, not an automatic restart: a browser that never
      // keeps the cookie would otherwise loop.
      return new NextResponse(
        `<!DOCTYPE html><html><body style="background:#1f1a2e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p>That sign-in didn't start in this browser, or took too long. <a href="/api/auth/login" style="color:#fff">Sign in again</a></p></body></html>`,
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const { codeVerifier, redirectTo } = stateData;

    // 2. Exchange authorization code for tokens
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
    const [userRow] = await db
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
      })
      .returning({ sessionVersion: users.sessionVersion });

    // No active membership after a real OAuth round trip means this person
    // just proved who they are but hasn't paid — send them straight to
    // checkout instead of bouncing back to the marketing landing page.
    // /checkout already reads the session's whopUserId itself (the
    // "returning buyer" path in createSignupCheckoutSession) so it greets
    // them correctly without any extra plumbing here. The landing page's
    // own /?membership=required banner is unrelated to this path — it's
    // still used by middleware.ts for a session whose membership lapses
    // after the fact on a protected route, which is a different moment
    // than "just signed in for the first time."
    // Checked again here: the state decrypts to whatever the login route
    // put in it, and older states predate the stricter check.
    const destination = membership.hasAccess ? safeRelativePath(redirectTo, "/home")! : "/checkout";

    // 6. Create the NextResponse object with the redirect HTML payload
    const response = new NextResponse(buildOAuthRedirectHtml(destination, "Authenticated. Redirecting..."), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    // 7. Bind iron-session to NextResponse (Next.js automatically serializes Set-Cookie)
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions
    );

    session.whopUserId = whopUserId;
    session.email = whopUser.email ?? "";
    session.subscriptionStatus = membership.status;
    session.subscriptionVerifiedAt = Date.now();
    session.refreshToken = tokens.refresh_token;
    session.sessionVersion = userRow?.sessionVersion ?? 0;

    // Mutates response.cookies directly on the outgoing NextResponse instance
    await session.save();
    // The login is used up.
    response.headers.append("Set-Cookie", `${OAUTH_NONCE_COOKIE}=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

    return response;
  } catch (err: any) {
    console.error("[whop-callback] Fatal:", err);
    return new NextResponse(`Auth error: ${err.message}`, { status: 500 });
  }
}