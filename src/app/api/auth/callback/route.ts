// src/app/api/auth/callback/whop/route.ts
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { decryptOAuthState } from "@/lib/oauth-state";
import { buildOAuthRedirectHtml } from "@/lib/oauth-redirect-html";

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
    const destination = membership.hasAccess ? redirectTo || "/home" : "/checkout";

    // 6. Create the NextResponse object with the redirect HTML payload
    const response = new NextResponse(buildOAuthRedirectHtml(destination, "Authenticated — redirecting..."), {
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

    // Mutates response.cookies directly on the outgoing NextResponse instance
    await session.save();

    return response;
  } catch (err: any) {
    console.error("[whop-callback] Fatal:", err);
    return new NextResponse(`Auth error: ${err.message}`, { status: 500 });
  }
}