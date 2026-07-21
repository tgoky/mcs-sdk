import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { exchangeCode, getWhopUser } from "@/lib/whop";
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
      return new NextResponse(`Whop OAuth error: ${error}`, { status: 400 });
    }

    if (!code || !rawState) {
      return new NextResponse("Missing code or state parameter", { status: 400 });
    }

    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
      return new NextResponse("SESSION_SECRET must be at least 32 characters", { status: 500 });
    }

    const stateData = decryptOAuthState(rawState, secret);
    if (!stateData?.codeVerifier) {
      return new NextResponse("Invalid or expired OAuth state.", { status: 400 });
    }

    const { codeVerifier, redirectTo } = stateData;

    const tokens = await exchangeCode(code, codeVerifier);
    const whopUser = await getWhopUser(tokens.access_token);
    const whopUserId = whopUser.sub;

    const admin = isAdminEmail(whopUser.email);
    const membership = admin
      ? { hasAccess: true, status: "admin" as const }
      : await checkActiveMembership(whopUserId);

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

    // 1. Get iron-session tied directly to Next.js cookieStore
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    session.whopUserId = whopUserId;
    session.email = whopUser.email ?? "";
    session.subscriptionStatus = membership.status;
    session.subscriptionVerifiedAt = Date.now();
    session.refreshToken = tokens.refresh_token;

    // 2. Mutate cookies directly on the request context
    await session.save();

    // 3. Perform standard same-origin redirect
    const destination = membership.hasAccess
      ? redirectTo || "/home"
      : "/?membership=required";

    return NextResponse.redirect(new URL(destination, request.url));
  } catch (err: any) {
    console.error("[whop-callback] Fatal:", err);
    return new NextResponse(`Auth error: ${err.message}`, { status: 500 });
  }
}